<script setup>
// EPG列表 —— 重构自 admin_epgs.html。
import { ref, onMounted, computed } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitUpload, submitSwitch } from '@/utils/page'
import { confirm } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, EPG_ROUTES as A } from '@/api/endpoints'
import AppModal from '@/components/AppModal.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppIcon from '@/components/AppIcon.vue'
import TagSelect from '@/components/TagSelect.vue'
import { Switch } from '@/components/ui/switch'
import { openImageZoom, closeImageZoom } from '@/utils/imageZoom'

const data = ref(null)
const loading = ref(false)
const keywords = ref('')
const page = ref(1)
const recCounts = ref(20)

const epgs = computed(() => data.value?.epgs || [])
const epgFromDb = computed(() => data.value?.epgFromDb || [])
const pageCount = computed(() => data.value?.pageCount || 1)

/** EPG 来源选项：0 = CCTV官网，其余来自 epgFromDb */
const fromOptions = computed(() => [
  { name: 'CCTV官网', value: 0 },
  ...epgFromDb.value.map((e) => ({ name: e.name, value: e.id })),
])

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminEpgsData, {
      page: page.value,
      recCounts: recCounts.value,
      keywords: keywords.value,
    })
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

function search() { page.value = 1; load() }
function changePage(p) { page.value = p; load() }
function changeRecCount() { page.value = 1; load() }

/* ---- 编辑弹窗 ---- */
const showEdit = ref(false)
const epgForm = ref({ epgId: '', name: '', epgRemarks: '' })
const epgFromList = ref([])

function openAdd() {
  epgForm.value = { epgId: '', name: '', epgRemarks: '' }
  epgFromList.value = []
  showEdit.value = true
}

// 「1,2,3」→ [1,2,3]。
const splitIds = (s) =>
  String(s ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map(Number)
    .filter((n) => !Number.isNaN(n))

// 「绑定频道」列的展示：名单可能几十个台，只显示前几个 + "等 N 个"，
// 完整名单放在 title 里（hover 可见）。
const BOUND_BRIEF_MAX = 4
function boundNamesBrief(content) {
  const list = String(content ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
  if (list.length <= BOUND_BRIEF_MAX) return list.join('、')
  return `${list.slice(0, BOUND_BRIEF_MAX).join('、')} 等 ${list.length} 个`
}

// 编辑回填直接读行对象 —— 原来靠行内隐藏 <td> 的 data-value 中转，
// 表头列数与实际列数对不上，字段改名时还会静默取到空串。
function openEdit(e) {
  epgForm.value = {
    epgId: String(e.id ?? ''),
    name: e.name ?? '',
    epgRemarks: e.remarks ?? '',
  }
  epgFromList.value = splitIds(e.fromList)
  showEdit.value = true
}

async function saveEpg() {
  if (!epgForm.value.name) { notify('请输入EPG名称', 'warning'); return }
  await submitAction(
    A.save,
    {
      id: Number(epgForm.value.epgId) || 0,
      name: epgForm.value.name,
      remarks: epgForm.value.epgRemarks,
      // 后端这两个字段是逗号分隔字符串（旧协议用 params.Get 取数组首元素，
      // 只能拿到第一个 —— 这里明确 join，行为符合原意）
      fromList: epgFromList.value.join(','),
    },
    { reload: async () => { showEdit.value = false; await load() } }
  )
}

/* ---- 手动绑定频道 ---- */
const showBind = ref(false)
const bindEpgId = ref('')
const bindEpgName = ref('')
const bindChList = ref([])
const blacklist = ref([])
const chOptions = ref([])
const bindLoading = ref(false)
// 已绑定的频道（后端算出来的，手动 ∪ 自动）—— 拖拽源。
const boundList = ref([])
// 正在被拖拽的频道名（拖到黑名单区时高亮）。
const dragging = ref('')

async function openBind(e) {
  bindEpgId.value = String(e.id ?? '')
  bindEpgName.value = e.name ?? ''
  bindChList.value = []
  blacklist.value = []
  boundList.value = []
  showBind.value = true
  bindLoading.value = true
  try {
    const res = await post(A.bindable, { id: Number(bindEpgId.value) || 0 })
    // 后端一次给全四样（dto.EpgBindableDto）：
    //   channels  = 库里现存的频道名（黑名单里的已剔除）；
    //   selected  = 这个 EPG 认领的全部台名（手动 ∪ 自动 − 黑名单）—— 拖拽源；
    //   manual    = 手动名单（用户手动指定的台）—— 多选框的预选；
    //   blacklist = 这个 EPG 的排除名单（可能有库里没有的名字）。
    //
    // ★selected 与列表页「绑定频道」列同源（后端 until.EpgBoundNames）——
    // 否则会出现"列表说绑着、弹窗说没绑"（实测：手动名单里的台库里没有对应频道时）。
    //
    // ★多选框预选的是 manual 而不是 selected：
    // 预选成"全部认领的台"的话，用户不改直接点确定，
    // 就把自动匹配上的台固化成手动名单了（content 优先级最高，
    // 之后自动规则改了也不再生效）。
    const d = res?.data || {}
    const channels = Array.isArray(d.channels) ? d.channels : []
    chOptions.value = channels.map((name) => ({ name, value: name }))
    boundList.value = Array.isArray(d.selected) ? d.selected : []
    blacklist.value = Array.isArray(d.blacklist) ? d.blacklist : []
    bindChList.value = Array.isArray(d.manual) ? d.manual : []
  } catch { /* 已处理 */ } finally {
    bindLoading.value = false
  }
}

async function saveBind() {
  await submitAction(
    A.bind,
    {
      id: Number(bindEpgId.value) || 0,
      channels: bindChList.value.join(','),
      blacklist: blacklist.value.join(','),
    },
    // ★只更新**这一行**，不整页刷新。
    // 整页刷新会把滚动位置、搜索条件和页码全冲掉，用户刚操作完又得从头找。
    // 后端把这一行当前的绑定名单一起回传了（data.bound），
    // 用它就地覆盖表格里那一行的「绑定频道」列。
    { reload: async (res) => { showBind.value = false; applyBoundToRow(res) } }
  )
}

/**
 * 把后端回传的绑定名单就地写进表格里对应的那一行。
 *
 * 后端返回的 data.bound 是「手动名单 ∪ 自动结果 − 黑名单」之后的展示串，
 * 与列表接口用的是同一个函数 —— 两边口径一致，
 * "保存后立刻看到的那一行"和"刷新页面看到的"才对得上。
 */
function applyBoundToRow(res) {
  const id = Number(res?.data?.id ?? bindEpgId.value)
  const bound = res?.data?.bound
  if (!id || typeof bound !== 'string') return
  const row = epgs.value.find((e) => Number(e.id) === id)
  if (row) row.content = bound
}

function clearBindSelection() { bindChList.value = [] }

/* ---- 黑名单（排除名单）---- */
// 语义：这个 EPG 不要这些台 —— 既不被自动规则绑上，也不被手动绑定绑上。
// 拉黑的动作本身会解绑（后端在重算绑定时把被拉黑的台摘下来）。

/** 把一个频道名拉进黑名单：加名单 + 从手动绑定里摘掉 + 从"已绑定"列表里摘掉。 */
function addToBlacklist(name) {
  const n = String(name || '').trim()
  if (!n) return
  if (!blacklist.value.includes(n)) blacklist.value = [...blacklist.value, n]
  bindChList.value = bindChList.value.filter((x) => String(x) !== n)
  // 它已经被拉黑 ⇒ 不再是"已绑定的频道"，从那一栏里也拿掉，
  // 否则用户会看到同一个台既在"已绑定"里又在"黑名单"里。
  boundList.value = boundList.value.filter((x) => String(x) !== n)
}

/** 从黑名单里移除（取消拉黑）—— 该台会在下次重算绑定时按规则重新绑定。 */
function removeFromBlacklist(name) {
  blacklist.value = blacklist.value.filter((x) => String(x) !== name)
}

/* 拖拽：把「已绑定的频道」拖进黑名单区。 */
function onDragStart(e, name) {
  dragging.value = String(name || '')
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 必须 setData 才会触发 dragstart 之后的 drop。
    try { e.dataTransfer.setData('text/plain', dragging.value) } catch { /* 忽略 */ }
  }
}

function onDragEnd() { dragging.value = '' }

function onDropToBlacklist(e) {
  e.preventDefault()
  const name = dragging.value || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '')
  if (name) addToBlacklist(name)
  dragging.value = ''
}

/* ---- 行操作 ---- */
// 上线/下线：只改本地这一行，**不重取整页**；失败回滚并弹错误提示。
// 反馈统一走右下角 toast，页面不再闪一下、滚动位置与排序也不会丢。
function onToggleStatus(e) {
  const next = !e.status
  return submitSwitch(
    A.status,
    { id: e.id },
    {
      apply: () => { e.status = next },
      revert: () => { e.status = !next },
      successMsg: next ? '已上线' : '已下线',
    }
  )
}

async function removeEpg(id) {
  if (!(await confirm('确定删除该EPG吗？', { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(A.delete, { id }, { reload: load })
}

const delNotFrom = async () => {
  if (!(await confirm('确定要删除无来源EPG吗？', { okVariant: 'danger', okText: '确定' }))) return
  await submitAction(A.deleteUnbound, {}, { reload: load })
}
// 自动绑定 = 全量重算，后台跑（要扫全部频道 + 重写绑定名单 + 作废缓存），
// 前端这边**不刷新表格**：刷出来的是重算前的旧名单，用户会以为"点了没反应"。
// 后端提示语已说明"后台运行中，请稍后刷新查看结果"，用户自己刷新即可。
const bindChannel = () => submitAction(A.bindChannel, {})
const clearBind = async () => {
  if (!(await confirm('确定要清空全部绑定吗？将解除所有频道的 EPG 绑定并清空手动绑定名单。', { okVariant: 'danger' }))) return
  await submitAction(A.clearBind, {}, { reload: load })
}
const clearCache = async () => {
  if (!(await confirm('确定要清空EPG缓存吗？', { okVariant: 'danger' }))) return
  await submitAction(A.clearCache, {}, { reload: load })
}

async function deleteLogo(id) {
  await submitAction(A.deleteLogo, { id }, { reload: load })
}

/* ---- logo 上传 ---- */
const logoInput = ref(null)
const logoEpgName = ref('')

// 上传/更换台标 —— 入口有两个（无图时的「上传」占位按钮、大图下方的「更换」），
function pickLogo(e) {
  logoEpgName.value = e.name || ''
  logoInput.value?.click()
}

// 点击缩略图 → 放大预览，并在**大图下方**给出「更换」「删除」（需求 5）。
function zoomLogo(e) {
  openImageZoom(e.logo, e.name, [
    // 先关浮层再执行：文件选择框/删除后的整页刷新都不该被这层遮罩挡着
    // （浮层是固定定位、z-index 2600，不关就会盖在系统文件对话框之上）。
    { label: '更换', onClick: () => { closeImageZoom(); pickLogo(e) } },
    { label: '删除', danger: true, onClick: () => { closeImageZoom(); deleteLogo(e.id) } },
  ])
}

// 上传台标 —— POST /admin/epgsList/uploadLogo（multipart）
async function onLogoUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!logoEpgName.value) {
    notify('未找到该 EPG 的名称，无法上传台标', 'danger')
    e.target.value = ''
    return
  }
  await submitUpload(API.adminEpgsUploadLogo, file, 'uploadlogo', {
    fields: { epgname: logoEpgName.value },
    reload: load,
  })
  e.target.value = ''
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header">
        <h4>EPG列表</h4>
        <span class="ui-hint">双击任意一行可编辑；台标在「logo」列上传或更换</span>
      </div>

      <div class="ui-card__toolbar">
        <div class="ui-inline u-gap-8">
          <button class="ui-btn ui-btn--primary ui-btn--sm" type="button" @click="openAdd">增加EPG</button>
          <button class="ui-btn ui-btn--sm" type="button" @click="delNotFrom">删除无来源EPG</button>
          <button class="ui-btn ui-btn--sm" type="button" @click="bindChannel">自动绑定频道</button>
          <button class="ui-btn ui-btn--sm" type="button" @click="clearBind">清空绑定</button>
          <button class="ui-btn ui-btn--sm" type="button" @click="clearCache">清空EPG缓存</button>
        </div>

        <div class="ui-inline u-gap-8">
          <select v-model.number="recCounts" class="ui-select ui-input--sm" style="width: 80px" @change="changeRecCount">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <input
            v-model="keywords"
            class="ui-input ui-input--sm"
            style="width: 200px"
            placeholder="请输入名称"
            @keyup.enter="search"
          />
          <button class="ui-btn ui-btn--sm" type="button" @click="search">搜索</button>
        </div>
      </div>

      <div class="ui-card__body ui-card__body--flush">
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="u-center">EPG名称</th>
                <th class="u-center" style="width: 150px">来源</th>
                <th class="u-center" style="width: 80px">状态</th>
                <th class="u-center" style="width: 118px">logo</th>
                <th>绑定频道</th>
                <th class="u-center" style="width: 190px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="ui-table__status"><span class="ui-spinner" />正在加载EPG列表…</td>
              </tr>
              <tr v-else-if="!epgs.length">
                <td colspan="6" class="ui-table__empty">当前未有EPG数据</td>
              </tr>
              <tr
                v-for="e in epgs"
                :key="e.id"
                class="is-editable"
                title="双击编辑该 EPG"
                v-rowtap="() => openEdit(e)"
              >
                <td class="u-center">{{ e.name }}</td>
                <td class="u-center u-text-sm">{{ e.fromName || '-' }}</td>
                <!-- 状态与上线/下线合并成一列开关；@dblclick.stop 免得双击开关顺带打开编辑弹窗 -->
                <td class="u-center" @dblclick.stop>
                  <Switch
                    :model-value="e.status"
                    :aria-label="e.status ? '点击下线' : '点击上线'"
                    @update:model-value="onToggleStatus(e)"
                  />
                </td>
                <!-- 台标入口就在这一列：没图时是一个「上传」占位按钮，有图时是缩略图 + 右上角红叉。 -->
                <!-- 「更换」**不在表格里**（2026-09-23）：换台标要先看清是哪张图， -->
                <!-- 点缩略图放大后，图片下方才有「更换」「删除」两个按钮。…… -->
                <td class="u-center" @dblclick.stop>
                  <div v-if="e.logo" class="logo-cell">
                    <img
                      :src="e.logo"
                      alt=""
                      class="logo-cell__img"
                      title="点击放大查看"
                      @click.stop="zoomLogo(e)"
                    />
                    <span class="logo-cell__del" title="删除台标" @click="deleteLogo(e.id)">&times;</span>
                  </div>
                  <button v-else class="logo-cell__add" type="button" title="上传台标（仅 PNG）" @click="pickLogo(e)">
                    <AppIcon name="image" :size="13" />
                    <span>上传</span>
                  </button>
                </td>
                <!-- 绑定频道：后端返回的 content 已经是「手动绑定名单 ∪ 自动绑定结果」的合并清单。
                     名单可能几十个台，这里只显示前几个 + 等 N 个，hover 看全文。 -->
                <td class="u-text-sm">
                  <span v-if="!e.content" class="u-text-3">-</span>
                  <span v-else class="u-ellipsis" :title="e.content">{{ boundNamesBrief(e.content) }}</span>
                </td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="openBind(e)">手动绑定</button>
                    <button
                      v-if="e.id > 18"
                      class="ui-btn ui-btn--danger ui-btn--xs"
                      type="button"
                      @click="removeEpg(e.id)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <input ref="logoInput" type="file" accept="image/png" style="display: none" @change="onLogoUpload" />
      </div>

      <AppPagination :page="data?.page ?? page" :page-count="pageCount" @page-change="changePage" />
    </div>

    <!-- 编辑EPG -->
    <AppModal v-model="showEdit" title="编辑EPG" size="lg">
      <div class="ui-field">
        <label class="ui-field__label">EPG名称</label>
        <input v-model="epgForm.name" class="ui-input" placeholder="EPG名称" />
      </div>

      <div class="ui-field">
        <label class="ui-field__label">EPG来源</label>
        <TagSelect v-model="epgFromList" :options="fromOptions" placeholder="请选择EPG节目单来源" />
      </div>

      <div class="ui-field">
        <label class="ui-field__label">自动绑定规则</label>
        <textarea
          v-model="epgForm.epgRemarks"
          class="ui-textarea"
          rows="4"
          placeholder="多个自动绑定规则匹配请用 | 分隔开"
        />
        <small class="ui-help">提示：多个自动绑定规则匹配请用 | 分隔开</small>
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showEdit = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveEpg">确定</button>
      </template>
    </AppModal>

    <!-- 手动绑定频道 -->
    <AppModal v-model="showBind" title="手动绑定频道" size="lg">
      <div class="ui-alert ui-alert--info u-mb-12">
        勾选后点确定即把该 EPG 与所选频道绑定；「清空选择」只清空本次勾选。
        不想绑的台可以<b>拖到下面的黑名单</b>，或直接在黑名单里选/输入名字。
      </div>

      <div class="ui-inline u-mb-12">
        <!-- 改不了的字段不再渲染成输入框（与「引擎状态」的展示方式一致） -->
        <span class="ui-kv" style="margin: 0">EPG：<span class="ui-kv__v">{{ bindEpgName || '-' }}</span></span>
        <button class="ui-btn ui-btn--sm" type="button" @click="clearBindSelection">清空选择</button>
        <span v-if="bindChList.length" class="ui-badge ui-badge--primary">已选 {{ bindChList.length }} 项</span>
      </div>

      <!-- 已绑定的频道：拖拽源。拖到黑名单区即拉黑（并解除绑定）。 -->
      <div class="ui-field">
        <label class="ui-field__label">
          已绑定的频道
          <span class="ui-help">把不要的台拖到下面的黑名单即可解除绑定</span>
        </label>
        <div v-if="bindLoading" class="ui-table__status"><span class="ui-spinner" />正在加载…</div>
        <div v-else-if="boundList.length" class="epg-drag-list">
          <span
            v-for="n in boundList"
            :key="n"
            class="epg-drag-item"
            draggable="true"
            title="拖到黑名单区即可排除这个台"
            @dragstart="onDragStart($event, n)"
            @dragend="onDragEnd"
          >{{ n }}</span>
        </div>
        <div v-else class="ui-help">当前没有已绑定的频道</div>
      </div>

      <div class="ui-field">
        <label class="ui-field__label">手动绑定频道</label>
        <div v-if="bindLoading" class="ui-table__status"><span class="ui-spinner" />正在加载可绑定频道…</div>
        <TagSelect
          v-else
          v-model="bindChList"
          :options="chOptions"
          placeholder="手动绑定频道"
          filterable
          batch-actions
          direction="down"
        />
      </div>

      <!-- 黑名单（排除名单）：这个 EPG 不要的台。拖进来 / 选进来 / 输进来都行。 -->
      <div class="ui-field u-mb-0">
        <label class="ui-field__label">
          黑名单（这些台不绑到这个 EPG）
          <span class="ui-help">可拖入上面的已绑定频道，也可选择现有频道名，或直接输入库里还没有的名字</span>
        </label>
        <div
          class="epg-blacklist-drop"
          :class="{ 'is-over': !!dragging }"
          @dragover.prevent
          @drop="onDropToBlacklist"
        >
          <TagSelect
            v-model="blacklist"
            :options="chOptions"
            placeholder="黑名单（可输入未收录的频道名）"
            filterable
            creatable
            direction="down"
          />
        </div>
        <div v-if="blacklist.length" class="epg-blacklist-list">
          <span
            v-for="n in blacklist"
            :key="n"
            class="epg-blacklist-item"
            title="点击移出黑名单"
            @click="removeFromBlacklist(n)"
          >{{ n }} &times;</span>
        </div>
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showBind = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveBind">确定</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* ---- 手动绑定弹窗：已绑定频道（拖拽源） + 黑名单（拖拽目标） ---- */

/* 已绑定的频道：可拖动的标签条。 */
.epg-drag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  background: var(--c-bg-subtle, transparent);
  max-height: 132px;
  overflow-y: auto;
}

.epg-drag-item {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  background: var(--background);
  font-size: 12.5px;
  cursor: grab;
  user-select: none;
  /* 拖起来的标签别跟着鼠标选中文本 */
  -webkit-user-drag: element;
}

.epg-drag-item:active { cursor: grabbing; }

/* 黑名单区：拖拽目标。有东西拖过来时高亮，提示"松手就拉黑"。 */
.epg-blacklist-drop {
  border: 1px dashed var(--c-border);
  border-radius: 6px;
  padding: 6px;
  transition: border-color .15s, background-color .15s;
}

.epg-blacklist-drop.is-over {
  border-color: var(--c-danger);
  background: var(--c-danger-soft, rgba(220, 38, 38, .08));
}

/* 黑名单内容：点一下就移出黑名单。 */
.epg-blacklist-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.epg-blacklist-item {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--c-danger);
  color: var(--c-danger);
  background: var(--c-danger-soft, rgba(220, 38, 38, .08));
  font-size: 12.5px;
  cursor: pointer;
}
</style>
