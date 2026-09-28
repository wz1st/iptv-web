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
const caList = computed(() => data.value?.caList || [])
const pageCount = computed(() => data.value?.pageCount || 1)

/** EPG 来源选项：0 = CCTV官网，其余来自 epgFromDb */
const fromOptions = computed(() => [
  { name: 'CCTV官网', value: 0 },
  ...epgFromDb.value.map((e) => ({ name: e.name, value: e.id })),
])
const caOptions = computed(() => caList.value.map((c) => ({ name: c.name, value: c.id })))

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
const epgCaList = ref([])

function openAdd() {
  epgForm.value = { epgId: '', name: '', epgRemarks: '' }
  epgFromList.value = []
  epgCaList.value = []
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

// 编辑回填直接读行对象 —— 原来靠行内隐藏 <td> 的 data-value 中转，
// 表头列数与实际列数对不上，字段改名时还会静默取到空串。
function openEdit(e) {
  epgForm.value = {
    epgId: String(e.id ?? ''),
    name: e.name ?? '',
    epgRemarks: e.remarks ?? '',
  }
  epgFromList.value = splitIds(e.fromList)
  epgCaList.value = splitIds(e.cas)
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
      caList: epgCaList.value.join(','),
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
const chOptions = ref([])
const bindLoading = ref(false)

async function openBind(e) {
  bindEpgId.value = String(e.id ?? '')
  bindEpgName.value = e.name ?? ''
  bindChList.value = []
  showBind.value = true
  bindLoading.value = true
  try {
    const res = await post(A.bindable, { id: Number(bindEpgId.value) || 0 })
    // 后端返回的是扁平数组 [{value,name,selected}]（dto.EpgsReturnDto），
    // 不是 {channels, selected} 这样的包装对象 —— 直接当选项用，已绑定的打勾。
    const list = Array.isArray(res?.data) ? res.data : []
    chOptions.value = list
    bindChList.value = list.filter((x) => x.selected).map((x) => String(x.value))
  } catch { /* 已处理 */ } finally {
    bindLoading.value = false
  }
}

async function saveBind() {
  await submitAction(
    A.bind,
    { id: Number(bindEpgId.value) || 0, channels: bindChList.value.join(',') },
    { reload: async () => { showBind.value = false; await load() } }
  )
}

function clearBindSelection() { bindChList.value = [] }

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
const bindChannel = () => submitAction(A.bindChannel, {}, { reload: load })
const clearBind = async () => {
  if (!(await confirm('确定要清空绑定的频道列表吗？手动绑定将会失效不会自动添加！', { okVariant: 'danger' }))) return
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
                <td class="u-text-sm">{{ e.content || '-' }}</td>
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

      <div class="ui-field u-mb-0">
        <label class="ui-field__label">自动绑定的分组</label>
        <small class="ui-help">不在分组内的频道将不会自动绑定</small>
        <TagSelect v-model="epgCaList" :options="caOptions" placeholder="选择自动绑定哪些频道分类中的频道" filterable direction="up" />
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showEdit = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveEpg">确定</button>
      </template>
    </AppModal>

    <!-- 手动绑定频道 -->
    <AppModal v-model="showBind" title="手动绑定频道" size="lg">
      <div class="ui-alert ui-alert--info u-mb-12">
        勾选后点确定即把该 EPG 与所选频道绑定；「清空绑定」只清空本次选择，点确定才写回。
      </div>

      <div class="ui-inline u-mb-12">
        <!-- 改不了的字段不再渲染成输入框（与「引擎状态」的展示方式一致） -->
        <span class="ui-kv" style="margin: 0">EPG：<span class="ui-kv__v">{{ bindEpgName || '-' }}</span></span>
        <button class="ui-btn ui-btn--sm" type="button" @click="clearBindSelection">清空选择</button>
        <span v-if="bindChList.length" class="ui-badge ui-badge--primary">已选 {{ bindChList.length }} 项</span>
      </div>

      <div class="ui-field u-mb-0">
        <div v-if="bindLoading" class="ui-table__status"><span class="ui-spinner" />正在加载可绑定频道…</div>
        <TagSelect
          v-else
          v-model="bindChList"
          :options="chOptions"
          placeholder="手动绑定频道"
          filterable
          direction="down"
        />
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showBind = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveBind">确定</button>
      </template>
    </AppModal>
  </div>
</template>
