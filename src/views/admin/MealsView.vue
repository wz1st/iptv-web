<script setup>
// 套餐管理 —— 重构自 admin_meals.html。
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { post } from '@/api/http'
import { submitAction, submitSwitch } from '@/utils/page'
import { confirm, notifyBox } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, MEAL_ROUTES, ROUTES } from '@/api/endpoints'
import AppModal from '@/components/AppModal.vue'
import AppIcon from '@/components/AppIcon.vue'
import CopyIconButton from '@/components/CopyIconButton.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const router = useRouter()

const data = ref(null)
const loading = ref(false)
const meals = computed(() => data.value?.meals || [])

/* ---- 编辑弹窗 ---- */
const showEdit = ref(false)
const showRss = ref(false)
const editForm = ref({ mealId: '', mealName: '' })
const editCaIds = ref([])     // 勾选的分类 id（字符串）
const categories = ref([])     // 可选分类
const rss = ref({ txt: '', ku9txt: '', m3u: '', epg: '' })
const rssMealId = ref('')

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminMealsData)
    // 分类列表由服务端在 AdminMealsDto 里未直接下发，这里单独取一次全量分类
    const ch = await post(API.adminChannelsData)
    categories.value = ch?.categories || []
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  if ((data.value?.channelNum ?? 0) < 1) {
    notifyBox('无频道信息，请先添加频道', { title: '错误', okText: '前往频道管理' }).then((ok) => {
      if (ok) router.push('/admin/channels')
    })
  }
})

function selectedCategoryIds(content) {
  if (!content) return []
  return String(content).split(',').map((s) => s.trim()).filter(Boolean)
}

function openAdd() {
  editForm.value = { mealId: '', mealName: '' }
  editCaIds.value = []
  showEdit.value = true
}

function openEdit(m) {
  editForm.value = { mealId: String(m.id), mealName: m.name }
  editCaIds.value = selectedCategoryIds(m.content)
  showEdit.value = true
}

function toggleCa(id) {
  const v = String(id)
  const i = editCaIds.value.indexOf(v)
  if (i > -1) editCaIds.value.splice(i, 1)
  else editCaIds.value.push(v)
}

const allCaChecked = computed({
  get: () => categories.value.length > 0 && editCaIds.value.length === categories.value.length,
  set: (v) => { editCaIds.value = v ? categories.value.map((c) => String(c.id)) : [] },
})

// 提交套餐 —— POST /admin/meals/save
// id 为 0 表示新增；ids 是勾选的频道分类 id 列表（值级就是分类 id）。
async function saveMeal() {
  if (!editForm.value.mealName) { notify('请输入套餐名称', 'warning'); return }

  await submitAction(
    MEAL_ROUTES.save,
    {
      id: Number(editForm.value.mealId) || 0,
      name: editForm.value.mealName,
      ids: editCaIds.value,
    },
    { reload: async () => { showEdit.value = false; await load() } }
  )
}

/* ---- 上下线 / 删除 ---- */
/** 上线/下线：只改本地这一行，不重取整页；失败回滚 + 右下角提示 */
function toggleStatus(m) {
  const next = !m.status
  return submitSwitch(
    MEAL_ROUTES.status,
    { id: m.id },
    {
      apply: () => { m.status = next },
      revert: () => { m.status = !next },
      successMsg: next ? '套餐已上线' : '套餐已下线',
    }
  )
}

async function removeMeal(m) {
  if (!(await confirm(`确定删除套餐「${m.name}」吗？`, { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(MEAL_ROUTES.delete, { id: m.id }, { reload: load })
}

/* ---- 订阅弹窗 ---- */
const rssLoading = ref(false)

// 订阅地址响应是 [{type, url}]（类型见 service/rssService.go 的 RssUrl），
function rssFields(list) {
  const pick = (t) => (Array.isArray(list) ? list.find((x) => x.type === t)?.url || '' : '')
  return { txt: pick('txt'), ku9txt: pick('ku9'), m3u: pick('m3u8'), epg: pick('epg') }
}

async function openRss(m) {
  rssMealId.value = String(m.id)
  rss.value = { txt: '', ku9txt: '', m3u: '', epg: '' }
  showRss.value = true
  rssLoading.value = true
  try {
    const res = await post(ROUTES.rssUrl, { id: String(m.id) })
    if (res.code >= 1 && res.data) {
      rss.value = rssFields(res.data)
    } else if (res.msg) {
      notify(res.msg, res.type || 'warning')
    }
  } catch { /* 已处理 */ } finally {
    rssLoading.value = false
  }
}

async function refreshKey() {
  try {
    // newKey 非空即「重新生成密钥」，此时后端忽略 id（与旧 getnewkey 语义一致）
    const res = await post(ROUTES.rssUrl, { id: rssMealId.value, newKey: '1' })
    if (res.code >= 1 && res.data) {
      rss.value = rssFields(res.data)
    }
    notify(res.msg || '已刷新KEY', res.type || 'success')
  } catch { /* 已处理 */ }
}

// 订阅地址四行（顺序与旧版一致）。
const rssRows = computed(() => [
  { label: 'TXT订阅', url: rss.value.txt },
  { label: '酷9TXT订阅', url: rss.value.ku9txt },
  { label: 'M3U订阅', url: rss.value.m3u },
  { label: 'EPG订阅', url: rss.value.epg },
])

// 点地址末尾的复制图标：写剪贴板，成功后把该行的图标换成对勾 1.5s。

/** 行尾的外链图标：noopener 免得新页拿到 window.opener 反向操作本页 */
function openRssUrl(url) {
  if (!url || !url.trim()) return
  window.open(url, '_blank', 'noopener')
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header">
        <h4>订阅列表</h4>
        <div class="ui-inline u-gap-12">
          <span class="ui-hint">双击任意一行可编辑</span>
          <button class="ui-btn ui-btn--primary ui-btn--sm" type="button" @click="openAdd">新增套餐</button>
        </div>
      </div>

      <div class="ui-card__body ui-card__body--flush">
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="u-center" style="width: 100px">套餐编号</th>
                <th class="u-center" style="width: 170px">套餐名称</th>
                <th class="u-center" style="width: 100px">套餐状态</th>
                <th>收视内容</th>
                <th class="u-center" style="width: 170px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="ui-table__status"><span class="ui-spinner" />正在加载套餐列表…</td>
              </tr>
              <tr v-else-if="!meals.length">
                <td colspan="5" class="ui-table__empty">当前未有套餐数据</td>
              </tr>
              <tr v-for="m in meals" :key="m.id" class="is-editable" title="双击编辑该套餐" v-rowtap="() => openEdit(m)">
                <td class="u-center">{{ m.id }}</td>
                <td class="u-center">{{ m.name }}</td>
                <!-- 状态与上线/下线合并成一列开关；双击整行打开编辑 -->
                <td class="u-center" @dblclick.stop>
                  <Switch
                    :model-value="m.status"
                    :aria-label="m.status ? '点击下线' : '点击上线'"
                    @update:model-value="toggleStatus(m)"
                  />
                </td>
                <td class="u-text-sm">{{ m.caName || '-' }}</td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="openRss(m)">订阅</button>
                    <button
                      v-if="m.id !== 1000"
                      class="ui-btn ui-btn--danger ui-btn--xs"
                      type="button"
                      @click="removeMeal(m)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 编辑 / 新增套餐 -->
    <AppModal
      v-model="showEdit"
      :title="editForm.mealId ? '编辑套餐' : '新增套餐'"
      size="lg"
    >
      <div class="ui-field">
        <label class="ui-field__label">套餐名称</label>
        <input v-model="editForm.mealName" class="ui-input" type="text" placeholder="请输入套餐名称" />
      </div>

      <div class="ui-field u-mb-0">
        <label class="ui-check u-mb-8">
          <input type="checkbox" :checked="allCaChecked" @change="allCaChecked = $event.target.checked" />
          <span>全选 / 反选</span>
        </label>

        <div class="ca-grid">
          <label v-for="c in categories" :key="c.id" class="ui-check ui-check--card">
            <input
              type="checkbox"
              :checked="editCaIds.includes(String(c.id))"
              @change="toggleCa(c.id)"
            />
            <span>{{ c.name }}</span>
          </label>
          <p v-if="!categories.length" class="u-text-sm u-text-3">暂无可选频道分类</p>
        </div>
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showEdit = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveMeal">确定</button>
      </template>
    </AppModal>

    <!-- 订阅地址 -->
    <AppModal v-model="showRss" title="订阅地址" size="lg">
      <div v-if="rssLoading" class="ui-alert ui-alert--info">
        <span class="ui-spinner" />正在获取订阅地址…
      </div>

      <div v-else>
        <div class="ui-field">
          <button class="ui-btn ui-btn--info ui-btn--sm" type="button" @click="refreshKey">刷新KEY</button>
          <small class="ui-help">提示：刷新KEY后之前的链接将不可用</small>
        </div>

        <!-- 订阅地址是"只读且只用来复制/打开"的东西 —— 不画成输入框， -->
        <!-- 用展示块（见 style.css 的 .ui-ro），末尾挂复制 / 外链两个图标按钮。 -->
        <!-- 写法对齐 one-kvm「设置 → 网络 → 访问地址预览」：文字 + 两个…… -->
        <div
          v-for="(it, i) in rssRows"
          :key="it.label"
          class="ui-field"
          :class="{ 'u-mb-0': i === rssRows.length - 1 }"
        >
          <label class="ui-field__label">{{ it.label }}</label>
          <div class="ui-ro ui-ro--mono rss-row">
            <span class="rss-row__val" :title="it.url">{{ it.url || '（暂无）' }}</span>

            <!-- 复制成功后就地换对勾 1.5s —— 由 CopyIconButton 内部负责， -->
            <!-- 它和「频道列表编辑器」右上角那个复制按钮是同一个组件， -->
            <!-- 所以两处的图标/尺寸/降级路径永远一致。…… -->
            <CopyIconButton
              :text="it.url"
              title="复制"
              label="复制订阅地址"
            />

            <Button
              variant="ghost"
              size="icon-sm"
              class="ui-ibtn shrink-0"
              type="button"
              title="在新标签打开"
              aria-label="在新标签页打开订阅地址"
              :disabled="!it.url"
              @click="openRssUrl(it.url)"
            >
              <AppIcon name="external" class="size-3.5" />
            </Button>
          </div>
          <small v-if="i === rssRows.length - 1" class="ui-help">
            提示：点地址末尾的复制图标写入剪贴板，点外链图标在新标签页打开
          </small>
        </div>
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showRss = false">关闭</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.ca-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
}
.ui-check--card {
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.ui-check--card:hover { border-color: var(--c-primary); }

/* 地址块本身就是一行 flex：文字占满剩余宽度，两个图标按钮钉在块内末尾。 */
.rss-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 地址**不截断**，跟着 .ui-ro 的 break-all 换行折行 —— 与 one-kvm 一致。 */
.rss-row__val {
  flex: 1 1 auto;
  min-width: 0;
}

/* 图标按钮的底色/悬停色统一在全局的 .ui-ibtn（style.css）里 */
</style>
