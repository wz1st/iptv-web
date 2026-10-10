<script setup>
// 频道管理面板 —— 重构自 admin_channels.html（最复杂的页面）。
import { ref, onMounted, computed, watch } from 'vue'
import { post, upload } from '@/api/http'
import { submitAction, submitSwitch, submitUpload } from '@/utils/page'
import { confirm, notifyBox } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, CHANNEL_ROUTES as A, EPG_ROUTES } from '@/api/endpoints'
import AppModal from '@/components/AppModal.vue'
import AppIcon from '@/components/AppIcon.vue'
import TagSelect from '@/components/TagSelect.vue'
import LineNumberedTextarea from '@/components/LineNumberedTextarea.vue'
import { Switch } from '@/components/ui/switch'
import { openImageZoom, closeImageZoom } from '@/utils/imageZoom'
import { latencyClass, latencyText } from '@/utils/latency'

// 本组件按 section 只渲染其中一块：
defineProps({
  /** 'group' | 'source' */
  section: { type: String, default: 'group' },
})

const data = ref(null)
const loading = ref(false)

const categoryList = computed(() => data.value?.categoryList || [])
const categories = computed(() => data.value?.categories || [])
const epgs = computed(() => data.value?.epgs || [])
const showAuto = computed(() => Boolean(data.value?.showAuto))

// 「中转访问」开关是否显示（分组表那一列 + 编辑弹窗里的「开启中转」）。
const showProxy = computed(() => Boolean(data.value?.showProxy))

// 频道源列表
const SECONDS_PER_HOUR = 3600

/** 秒 -> 小时（整数展示；7200 显示成 2） */
const secToHour = (sec) => Math.max(1, Math.round((Number(sec) || 0) / SECONDS_PER_HOUR))

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminChannelsData)
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

/** 行内改「更新间隔」（失焦/回车提交）。传非法值则回读服务端当前值。 */
async function saveListInterval(cl, ev) {
  const hours = Math.floor(Number(ev?.target?.value) || 0)
  if (!hours || hours <= 0) {
    // 用户填了个空/0：把输入框恢复成该行的当前值，不发请求
    if (ev?.target) ev.target.value = secToHour(cl.interval)
    notify('更新间隔必须大于 0 小时', 'warning')
    return
  }
  const seconds = hours * SECONDS_PER_HOUR
  if (seconds === Number(cl.interval)) return
  const prev = cl.interval
  await submitSwitch(A.listFlag, { id: cl.id, interval: seconds, auto: !!(cl.auto) }, {
    apply: () => { cl.interval = seconds },
    revert: () => { cl.interval = prev; if (ev?.target) ev.target.value = secToHour(prev) },
    successMsg: '更新间隔已保存',
  })
}

/** 行内改「自动更新」开关：只改本地这一行，不重取整页 */
function toggleListAuto(cl) {
  const next = !cl.auto
  return submitSwitch(A.listFlag, { id: cl.id, interval: Number(cl.interval) || SECONDS_PER_HOUR * 2, auto: next }, {
    apply: () => { cl.auto = next },
    revert: () => { cl.auto = !next },
    successMsg: next ? '已开启自动更新' : '已关闭自动更新',
  })
}

const updateAll = () => submitAction(A.listUpdateAll, {}, { reload: load })

/* ---------- 外部列表弹窗 ---------- */
const showList = ref(false)

/** 新增源时的默认更新间隔（小时）——与后端 AddList 的 7200 秒兜底保持一致 */
const DEFAULT_INTERVAL_HOURS = 2

/** 弹窗表单的空值。interval 以**小时**存放（提交时才 ×3600 换成秒）。 */
const emptyListForm = () => ({
  clId: '', listname: '', listurl: '', listua: '',
  autoCategory: false, autoGroup: false, ku9: false, dedup: false, autoRename: false,
  interval: DEFAULT_INTERVAL_HOURS,
})

const listForm = ref(emptyListForm())

// 回填表单统一读「行对象」而不是「行内的隐藏 <td>」。
function openAddList() {
  listForm.value = emptyListForm()
  showList.value = true
}

// 开关量在后端已经就是 bool（models 里是 bool 字段，JSON 直出真假），
function openEditList(cl) {
  listForm.value = {
    clId: String(cl.id ?? ''),
    listname: cl.name ?? '',
    listurl: cl.url ?? '',
    listua: cl.ua ?? '',
    autoCategory: !!(cl.autoCategory),
    autoGroup: !!(cl.autoGroup),
    ku9: !!(cl.ku9),
    dedup: !!(cl.dedup),
    autoRename: !!(cl.autoRename),
    // 库里是秒，表单里是小时 —— 与行内那格同一口径（secToHour 兜 1 小时下限）
    interval: secToHour(cl.interval),
  }
  showList.value = true
}

async function saveList() {
  if (!listForm.value.listname || !listForm.value.listurl) {
    notify('请填写分类名称和列表链接', 'warning')
    return
  }
  const f = listForm.value
  // 与行内那格同一条判据：间隔必须 > 0 小时（后端扫描的判据是 interval > 0，
  // 传 0 会让这个源静默地永远轮不到更新）。空/0/负数一律挡在前端。
  const hours = Math.floor(Number(f.interval) || 0)
  if (hours <= 0) {
    notify('更新间隔必须大于 0 小时', 'warning')
    return
  }
  await submitAction(
    A.listSave,
    {
      id: Number(f.clId) || 0,
      name: f.listname,
      url: f.listurl,
      ua: f.listua,
      autoCategory: f.autoCategory,
      autoGroup: f.autoGroup,
      ku9: f.ku9,
      dedup: f.dedup,
      autoRename: f.autoRename,
      interval: hours * SECONDS_PER_HOUR,
    },
    { reload: async () => { showList.value = false; await load() } }
  )
}

const updateOneList = (id) => submitAction(A.listUpdate, { id }, { reload: load })

/** 外部列表启停：只改本地这一行，不重取整页；失败回滚 + 右下角提示 */
function toggleListStatus(cl) {
  const next = !cl.enable
  return submitSwitch(A.caListStatus, { id: cl.id }, {
    apply: () => { cl.enable = next },
    revert: () => { cl.enable = !next },
    successMsg: next ? '已启用' : '已停用',
  })
}

async function delList(id) {
  if (!(await confirm('确定删除该列表吗？', { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(A.listDelete, { id }, { reload: load })
}

// 分类拖拽排序
const dragId = ref(null)
const dropTargetId = ref(null)
const handleHeld = ref(false)

const isSortable = (c) => Number(c.sort) >= 0
const isDraggable = (c) => handleHeld.value && isSortable(c)

function onHandleDown(c) { handleHeld.value = isSortable(c) }
function onHandleUp() { handleHeld.value = false }

function onDragStart(c, e) {
  if (!isSortable(c)) { e.preventDefault(); return }
  dragId.value = String(c.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 不 setData 就不会真正开始拖拽
    e.dataTransfer.setData('text/plain', String(c.id))
  }
}

function onDragOver(c, e) {
  if (dragId.value === null || !isSortable(c)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetId.value = String(c.id)
}

function onDragLeave(c) {
  if (dropTargetId.value === String(c.id)) dropTargetId.value = null
}

function onDragEnd() {
  dragId.value = null
  dropTargetId.value = null
  handleHeld.value = false
}

async function onDrop(c, e) {
  e.preventDefault()
  const from = dragId.value
  dragId.value = null
  dropTargetId.value = null
  handleHeld.value = false
  if (!from || String(c.id) === from) return

  // 只在「可排序的那一段」里挪动，默认分类原样留在最前
  const movable = categories.value.filter(isSortable)
  const fromIdx = movable.findIndex((x) => String(x.id) === from)
  const toIdx = movable.findIndex((x) => String(x.id) === String(c.id))
  if (fromIdx < 0 || toIdx < 0) return

  const next = movable.slice()
  next.splice(toIdx, 0, next.splice(fromIdx, 1)[0])
  await submitAction(A.caSort, { ids: next.map((x) => Number(x.id)) }, { reload: load })
}

/* ---------- 分类编辑弹窗 ---------- */
const showCa = ref(false)
const caForm = ref({ caId: '', caname: '', caua: '', proxy: false, autoRename: true, ku9: '', autoType: '', rulesRe: '' })
const ruleEpgs = ref([])     // EPG 聚合选中的 epg id
const autoMode = ref('')     // '' | 'autoRe' | 'autoEpgs'

// 弹窗里当前是否为聚合分组（正则聚合 / EPG聚合）。
const isAutoCa = computed(() => autoMode.value === 'autoRe' || autoMode.value === 'autoEpgs')

// 一选中聚合模式就把中转顶到开（开关随后被 :disabled 锁死）
watch(autoMode, (m) => {
  if (m === 'autoRe' || m === 'autoEpgs') caForm.value.proxy = true
})

/** 行对象是否为聚合分组（type 以 auto 开头：autoRe / autoEpgs） */
function isAutoType(c) {
  return String(c?.type ?? '').includes('auto')
}

function openAddCa() {
  caForm.value = { caId: '', caname: '', caua: '', proxy: false, autoRename: true, ku9: '', autoType: '', rulesRe: '' }
  ruleEpgs.value = []
  autoMode.value = ''
  showCa.value = true
}

function openEditCa(c) {
  caForm.value = {
    caId: String(c.id ?? ''),
    caname: c.name ?? '',
    caua: c.ua ?? '',
    // 聚合分组恒开中转（历史数据可能没开，进编辑时一并纠正）
    proxy: isAutoType(c) ? true : !!(c.proxy),
    autoRename: !!(c.autoRename),
    ku9: c.ku9 ?? '',
    autoType: c.type ?? '',
    rulesRe: c.rules ?? '',
  }
  // 依据类型回填聚合模式
  const t = c.type
  autoMode.value = t === 'autoRe' ? 'autoRe' : t === 'autoEpgs' ? 'autoEpgs' : ''
  ruleEpgs.value = []
  showCa.value = true
}

async function saveCa() {
  if (!caForm.value.caname) { notify('请输入分组名称', 'warning'); return }
  const f = caForm.value
  await submitAction(
    A.caSave,
    {
      id: Number(f.caId) || 0,
      name: f.caname,
      ua: f.caua,
      // 聚合分组固定提交"开"，不看表单里的值（开关已被禁用，这里是双保险）
      proxy: isAutoCa.value ? true : f.proxy,
      autoRename: f.autoRename,
      ku9: f.ku9,
      autoType: autoMode.value,
      rulesRe: f.rulesRe,
      // 后端 rulesEpg 是字符串（旧协议 params.Get 只能取到数组首元素）
      rulesEpg: ruleEpgs.value.join(','),
    },
    { reload: async () => { showCa.value = false; await load() } }
  )
}

/** 分类启停：只改本地这一行，不重取整页；失败回滚 + 右下角提示 */
function toggleCaStatus(c) {
  const next = !c.enable
  return submitSwitch(A.caStatus, { id: c.id }, {
    apply: () => { c.enable = next },
    revert: () => { c.enable = !next },
    successMsg: next ? '已上线' : '已下线',
  })
}

// 分组列表上「中转访问 / 频道重命名」两列的开关。
function toggleCaFlag(c, field) {
  // 聚合分组的中转恒开：关掉它等于让这个分组彻底出不了图
  if (field === 'proxy' && isAutoType(c)) {
    notify('聚合分组固定开启中转，不可关闭', 'warning')
    return
  }
  const next = !c[field]
  const body = {
    id: c.id,
    proxy: field === 'proxy' ? next : !!(c.proxy),
    autoRename: field === 'autoRename' ? next : !!(c.autoRename),
  }
  const label = field === 'proxy' ? '中转访问' : '频道重命名'
  return submitSwitch(A.caFlag, body, {
    apply: () => { c[field] = next },
    revert: () => { c[field] = !next },
    successMsg: `${label}已${next ? '开启' : '关闭'}`,
    // 连点几行的开关时原地更新同一条右下角提示，不堆叠
    successId: 'ca-flag',
  })
}

async function delCa(id) {
  if (!(await confirm('确定删除该分组吗？删除后分组内频道将一并移除。', { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(A.caDelete, { id }, { reload: load })
}

/* ---------- 文件导入 ---------- */
const fileInput = ref(null)
async function onPayListFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  await submitUpload(API.adminChannelsUploadPayList, file, 'paylistfile', { reload: load })
  e.target.value = ''
}

// 编辑频道（频道列表）弹窗
const showTxt = ref(false)
const txtForm = ref({ caId: '', caname: '', proxy: false })
// 当前打开的分组是不是**聚合分组**（正则聚合 / EPG聚合）。
const txtAuto = ref(false)
// 编辑弹窗自己的频道数组（[]models.IptvChannelShow）——**打开时的快照**。
const viewChs = ref([])
/** false = 源地址视图（可编辑），true = 中转地址视图（只读） */
const viewProxy = ref(false)
/** 频道数组是否成功读回 —— 取数失败时不猜任何状态 */
const viewLoaded = ref(false)
// 编辑框正文。**可编辑** → 是 ref 而不是 computed：打开弹窗与切换视图时
const editText = ref('')
const savingChs = ref(false)

// 编辑框正文 ← 当前快照（打开弹窗、切换源/中转视图时各来一次）。
function syncEditor() {
  // 中转视图用 `purl || url` 而不是只取 purl：聚合分组里"来源分组没开中转、
  // 也没配自定义 UA"的频道**不生成中转地址**（引擎 aggregateNeedsProxy），
  // 这批频道的实际下发/订阅地址就是源地址 —— 只挑 purl 会让它们整行消失，
  // 看起来像"聚合分组丢了几个台"。
  editText.value = viewProxy.value
    ? viewChs.value.map((c) => `${c.name},${c.purl || c.url}`).join('\n')
    : viewChs.value.map((c) => `${c.name},${c.url}`).join('\n')
}

// 停用行名单（按行内容匹配，见 LineNumberedTextarea 的 offLines）。
const activeOffLines = computed(() =>
  viewProxy.value ? [] : viewChs.value.filter((c) => !c.status).map((c) => `${c.name},${c.url}`)
)

/** 行内容 → 比较用的键（只剥行尾 \r，与 LineNumberedTextarea 的 normKey 同口径） */
const normLine = (s) => String(s ?? '').replace(/\r$/, '')

// 逐行悬停提示（传给 LineNumberedTextarea 的 lineTips，见该组件的第 6 条说明）。
const lineTips = computed(() => {
  if (!txtAuto.value) return []
  const map = new Map()
  for (const c of viewChs.value) {
    if (!c.caName) continue
    // 三种情况分开说，否则"没开中转却还在中转"看起来像 bug：
    // 来源分组配了 UA 时，链接必须经中转取流（UA 由中转带上）。
    let via
    if (c.proxy) via = '该分组已开启中转，此处为中转后地址'
    else if (c.ua) via = '该分组未开中转，但配了自定义 UA —— 仍走中转（UA 由中转带上）'
    else via = '该分组未开中转且未配 UA，此处为源地址'
    const tip = `来源分组：${c.caName}（${via}）`
    map.set(`${c.name},${c.url}`, tip)
    if (c.purl) map.set(`${c.name},${c.purl}`, tip)
  }
  return String(editText.value ?? '')
    .split('\n')
    .map((l) => map.get(normLine(l)) || '')
})

/** 读取当前分组的频道（打开弹窗时调一次；保存成功后也走它刷新快照与高亮） */
async function loadViewChannels() {
  try {
    const res = await post(A.caChannels, { id: Number(txtForm.value.caId) || 0 })
    // 后端返回的是**频道数组**（[]models.IptvChannelShow），不是
    // {srclist, purl, channels} 这样的包装对象 —— 编辑区内容只能由数组现推。
    viewChs.value = Array.isArray(res?.data) ? res.data : []
    viewLoaded.value = true
  } catch {
    notify('读取频道列表失败', 'danger')
    return
  }
  syncEditor()
}

async function openTxt(c) {
  txtForm.value = {
    caId: String(c.id ?? ''),
    caname: c.name ?? '',
    // 分组没开中转 → 这个分组压根没有中转地址可看，弹窗里连切换按钮都不画
    proxy: !!(c.proxy),
  }
  // 聚合分组：只读查看（频道是算出来的，改了不生效，后端也直接拒）
  txtAuto.value = isAutoType(c)
  viewProxy.value = false
  viewChs.value = []
  viewLoaded.value = false
  editText.value = ''
  showTxt.value = true
  await loadViewChannels()
}

/** 源地址 ⇄ 中转地址：换的是同一块编辑区里的文本，不是换块 */
function toggleView() {
  viewProxy.value = !viewProxy.value
  // 两种视图内容不同（且一份可编辑、一份只读），切换时以快照重推 ——
  // 中转视图本来就没有可编辑的内容，上一份草稿没有保留的价值
  syncEditor()
  // 两份内容行数不同，留着上一次的 scrollTop 会让新内容一进来就"停在中间"
  chanEditor.value?.resetScroll()
}

// 行号区的停用/启用切换 —— **点一下就直接落库**，不必也不再有"确定"可点。
function toggleOffLine(i, text) {
  if (viewProxy.value) return          // 中转视图里没有状态可改
  if (txtAuto.value) return            // 聚合分组的频道是算出来的，库里没有这一行
  if (!viewLoaded.value) return        // 取数失败时编辑区是空的，不要猜
  const key = normLine(text)
  const ch = viewChs.value.find((c) => `${c.name},${c.url}` === key)
  if (!ch || !ch.id) return
  const next = !ch.status
  return submitSwitch(A.channelStatus, { id: ch.id, status: next }, {
    apply: () => { ch.status = next },
    revert: () => { ch.status = !next },
    successMsg: next ? '该频道已启用' : '该频道已停用',
    successId: 'ch-status',
  })
}

// 提交前把停用状态合并回行首 `0|` / `1|` 前缀（`until.AddChannelList` 的 wire 格式）。
function buildImportText() {
  const off = new Set(activeOffLines.value.map(normLine))
  return String(editText.value ?? '')
    .split('\n')
    .map((raw) => {
      const line = normLine(raw)
      if (!line.trim()) return line
      const m = /^[01]\|/.exec(line.trimStart())
      if (m) {
        const body = line.trimStart().slice(2)
        return (m[0][0] === '0' ? '0|' : '1|') + body
      }
      return (off.has(line) ? '0|' : '1|') + line
    })
    .join('\n')
}

// 保存 —— 整表提交（顺序 + 内容 + 启停一次写完）。
async function saveChannels() {
  if (viewProxy.value || savingChs.value) return
  const list = buildImportText()

  const keep = new Set(
    list.split('\n')
      .map((l) => normLine(l).trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[01]\|/, ''))
  )
  const dropped = viewChs.value.filter((c) => !keep.has(`${c.name},${c.url}`))
  if (dropped.length) {
    const ok = await confirm(
      `提交的内容里不包含 ${dropped.length} 个原有频道，保存后它们将被删除。确定继续吗？`,
      { title: '保存频道列表', okVariant: 'danger', okText: '删除并保存' }
    )
    if (!ok) return
  }

  savingChs.value = true
  try {
    await submitAction(A.chImport, { caId: Number(txtForm.value.caId) || 0, list }, {
      reload: loadViewChannels,
    })
  } finally {
    savingChs.value = false
  }
}

// EPG 管理（频道列表）弹窗
const showListModal = ref(false)
const chList = ref([])
const chLoading = ref(false)
const chCaId = ref('')
const chCaName = ref('')
/** 当前分组的 type —— 只用来判断"能不能拖"（聚合分组的频道是算出来的） */
const chCaType = ref('')

// 拉取某个分类下的频道。
async function getChannels(caId, caName, caType) {
  chCaId.value = String(caId)
  if (caName) chCaName.value = caName
  if (caType !== undefined) chCaType.value = caType ?? ''
  chList.value = []
  showListModal.value = true
  chLoading.value = true
  try {
    const res = await post(A.caChannels, { id: Number(caId) || 0 })
    // data 就是频道数组本身（[]models.IptvChannelShow）
    chList.value = Array.isArray(res?.data) ? res.data : []
  } catch { /* 已处理 */ } finally {
    chLoading.value = false
  }
}

// 频道拖拽排序
const chDragId = ref(null)
const chDropId = ref(null)
const chHandleHeld = ref(false)

const canSortCh = computed(() => !String(chCaType.value || '').includes('auto'))
const isDraggableCh = computed(() => chHandleHeld.value && canSortCh.value)

function onChHandleDown() { chHandleHeld.value = canSortCh.value }
function onChHandleUp() { chHandleHeld.value = false }

function onChDragStart(ch, e) {
  if (!canSortCh.value) { e.preventDefault(); return }
  chDragId.value = String(ch.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 不 setData 就不会真正开始拖拽
    e.dataTransfer.setData('text/plain', String(ch.id))
  }
}

function onChDragOver(ch, e) {
  if (chDragId.value === null || !canSortCh.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  chDropId.value = String(ch.id)
}

function onChDragLeave(ch) {
  if (chDropId.value === String(ch.id)) chDropId.value = null
}

function onChDragEnd() {
  chDragId.value = null
  chDropId.value = null
  chHandleHeld.value = false
}

async function onChDrop(ch, e) {
  e.preventDefault()
  const from = chDragId.value
  chDragId.value = null
  chDropId.value = null
  chHandleHeld.value = false
  if (!from || String(ch.id) === from) return

  const next = chList.value.slice()
  const fromIdx = next.findIndex((x) => String(x.id) === from)
  const toIdx = next.findIndex((x) => String(x.id) === String(ch.id))
  if (fromIdx < 0 || toIdx < 0) return

  next.splice(toIdx, 0, next.splice(fromIdx, 1)[0])
  await submitAction(
    A.chSort,
    { caId: Number(chCaId.value) || 0, ids: next.map((x) => Number(x.id)) },
    { reload: () => getChannels(chCaId.value) }
  )
}

// LOGO 列：上传 / 更换 / 删除
const chLogoInput = ref(null)
const chLogoCh = ref(null)

function pickChLogo(ch) {
  if (!ch.epgName) {
    notify('该频道未绑定 EPG，台标是绑定在 EPG 上的', 'danger')
    return
  }
  chLogoCh.value = ch
  chLogoInput.value?.click()
}

// 点击缩略图 → 放大预览 + 图下方「更换」「删除」（需求 5，与 EPG列表 同款）。
function zoomChLogo(ch) {
  openImageZoom(ch.logo, ch.epgName || ch.name, [
    { label: '更换', onClick: () => { closeImageZoom(); pickChLogo(ch) } },
    { label: '删除', danger: true, onClick: () => { closeImageZoom(); deleteChLogo(ch) } },
  ])
}

// 上传台标 —— POST /api/epgs/uploadLogo（multipart）
// 字段：epgname（EPG 名称）+ uploadlogo（PNG 文件）。与 EPG列表 用的是同一个接口。
async function onChLogoUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const epgName = chLogoCh.value?.epgName || ''
  if (!epgName) {
    notify('未找到该频道的 EPG 名称，无法上传台标', 'danger')
    e.target.value = ''
    return
  }
  await submitUpload(API.adminEpgsUploadLogo, file, 'uploadlogo', {
    fields: { epgname: epgName },
    reload: refreshAfterChLogo,
  })
  e.target.value = ''
}

/** 删除某个频道所绑 EPG 的台标（与 EPG列表 的「×」同一条路由） */
async function deleteChLogo(ch) {
  if (!ch.epgId) return
  await submitAction(EPG_ROUTES.deleteLogo, { id: ch.epgId }, { reload: refreshAfterChLogo })
}

/** 台标变动后：弹窗里的频道表 + 页面级数据一起重取，两边立刻一致 */
async function refreshAfterChLogo() {
  if (chCaId.value) await getChannels(chCaId.value)
  await load()
}

/* ---------- 单条频道编辑 ---------- */
const showEditCh = ref(false)
const chForm = ref({ caId: '', chId: '', chname: '', chURL: '', eId: '' })
const epgOptions = computed(() =>
  epgs.value.map((e) => ({ name: e.name, value: e.id, logo: e.logo || '' }))
)

function openEditChannel(ch) {
  chForm.value = {
    caId: chCaId.value,
    chId: String(ch.id),
    chname: ch.name,
    chURL: ch.url,
    eId: ch.epgId || '',
  }
  showEditCh.value = true
}

async function saveChannelOne() {
  // 聚合分组的频道不在库里（引擎按规则算出来的），写它必然被后端拒。
  if (!canSortCh.value) return
  await submitAction(
    A.saveOne,
    {
      id: Number(chForm.value.chId) || 0,
      name: chForm.value.chname,
      url: chForm.value.chURL,
      epgId: Number(chForm.value.eId) || 0,
    },
    { reload: async () => {
      showEditCh.value = false
      await getChannels(chCaId.value)
    } }
  )
}

// 台标上传**已从本弹窗移到频道表的 LOGO 列**（见 pickChLogo / onChLogoUpload）。

// 测速 / 分辨率测试（单条）
const chTestId = ref(null)

async function testResolution(ch) {
  if (chTestId.value !== null) return
  chTestId.value = ch.id
  try {
    const res = await post(A.testResolution, { id: ch.id })
    const d = res?.data
    if (d && Number(d.id) === Number(ch.id)) {
      if (d.resolution !== undefined) ch.resolution = d.resolution
      if (d.speed !== undefined) ch.speed = d.speed
      if (d.status !== undefined) ch.status = !!d.status
    }
    const good = res?.code >= 1
    // 固定 id = 连点几条也只在右下角留一条，文案跟着最后一次结果变
    notify(good ? (res?.msg || '测试完成') : (res?.msg || '测试失败'),
      good ? 'success' : 'danger', good ? 1800 : 3200, 'ch-test')
  } catch (e) {
    notify(e?.message || '测试失败', 'danger', 3200, 'ch-test')
  } finally {
    chTestId.value = null
  }
}

// 删除分组内的单个频道（「管理」弹窗操作列的「删除」）。
async function deleteChannel(ch) {
  if (!canSortCh.value) return
  const ok = await confirm(`确定删除频道「${ch.name || ch.url}」吗？`, {
    title: '删除频道',
    okVariant: 'danger',
    okText: '删除',
  })
  if (!ok) return
  await submitAction(A.chDelete, { id: ch.id }, { reload: () => getChannels(chCaId.value) })
}

/** 单条频道启停：只改本地这一行，不重取整表；失败回滚 + 右下角提示。
 *  提交的是**目标状态**（不是"请取反"）—— 见 dto.ChannelsStatusReq 的说明。 */
function setChannelStatus(ch) {
  const next = !ch.status
  return submitSwitch(A.channelStatus, { id: ch.id, status: next }, {
    apply: () => { ch.status = next },
    revert: () => { ch.status = !next },
    successMsg: next ? '已启用' : '已停用',
    // 与「编辑频道」弹窗里的行号区切换共用同一个 id：同一个动作，连点也只留一条提示
    successId: 'ch-status',
  })
}

const TYPE_LABEL = {
  add: '源导入',
  file: '文件导入',
  user: '手动添加',
  auto: '正则聚合',
  autoRe: '正则聚合',
  autoEpgs: 'EPG聚合',
}
</script>

<template>
  <div>
    <!-- 标签：频道源设置（外部列表的增删改与更新） -->
    <template v-if="section === 'source'">
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>频道源设置</h4>
          <span class="ui-hint">双击任意一行可编辑</span>
        </div>

        <div class="ui-card__toolbar">
          <div class="ui-inline u-gap-8">
            <span class="u-text-sm u-text-2">更新间隔与自动更新按源独立设置（默认 2 小时）</span>
          </div>

          <div class="ui-inline u-gap-8">
            <button class="ui-btn ui-btn--sm" type="button" @click="updateAll">更新全部</button>
            <button class="ui-btn ui-btn--primary ui-btn--sm" type="button" @click="openAddList">添加列表</button>
          </div>
        </div>

        <div class="ui-card__body ui-card__body--flush">
          <div class="ui-table-wrap">
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="u-center" style="width: 120px">名称</th>
                  <th>url</th>
                  <th class="u-center" style="width: 150px">最后更新时间</th>
                  <th class="u-center" style="width: 90px">自动分组</th>
                  <th class="u-center" style="width: 90px">自动去重</th>
                  <th class="u-center" style="width: 130px">更新间隔</th>
                  <th class="u-center" style="width: 90px">自动更新</th>
                  <th class="u-center" style="width: 80px">状态</th>
                  <th class="u-center" style="width: 170px">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="9" class="ui-table__status"><span class="ui-spinner" />正在加载频道源…</td>
                </tr>
                <tr v-else-if="!categoryList.filter((c) => c.url).length">
                  <td colspan="9" class="ui-table__empty">当前未有外部列表数据</td>
                </tr>
                <tr
                  v-for="cl in categoryList.filter((c) => c.url)"
                  :key="cl.id"
                  class="is-editable"
                  title="双击编辑该列表"
                  v-rowtap="() => openEditList(cl)"
                >
                  <td class="u-center">{{ cl.name }}</td>
                  <td class="u-text-sm" style="word-break: break-all">
                    <a :href="cl.url" target="_blank" rel="noopener">{{ cl.url }}</a>
                  </td>
                  <td class="u-center u-text-sm">{{ cl.latestTime }}</td>
                  <td class="u-center">{{ !!(cl.autoCategory) ? '启用' : '关闭' }}</td>
                  <td class="u-center">{{ !!(cl.dedup) ? '启用' : '关闭' }}</td>
                  <!-- 更新间隔：按源独立。以「小时」呈现，失焦/回车换算成秒提交。 -->
                  <td class="u-center" @dblclick.stop>
                    <div class="ui-inline u-gap-4">
                      <input
                        class="ui-input ui-input--sm"
                        style="width: 56px"
                        type="number"
                        min="1"
                        step="1"
                        :value="secToHour(cl.interval)"
                        :aria-label="`更新间隔（小时）：${secToHour(cl.interval)}`"
                        @change="saveListInterval(cl, $event)"
                        @keyup.enter="saveListInterval(cl, $event)"
                      />
                      <span class="u-text-sm u-text-2">小时</span>
                    </div>
                  </td>
                  <td class="u-center" @dblclick.stop>
                    <Switch
                      :model-value="!!(cl.auto)"
                      :aria-label="!!(cl.auto) ? '点击关闭自动更新' : '点击开启自动更新'"
                      @update:model-value="toggleListAuto(cl)"
                    />
                  </td>
                  <!-- 状态与启停合并成一列开关：状态的显示与"改它"的动作本该是同一个东西 -->
                  <td class="u-center" @dblclick.stop>
                    <Switch
                      :model-value="!!(cl.enable)"
                      :aria-label="!!(cl.enable) ? '点击下线' : '点击上线'"
                      @update:model-value="toggleListStatus(cl)"
                    />
                  </td>
                  <td class="u-center" @dblclick.stop>
                    <div class="ui-table__actions">
                      <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="updateOneList(cl.id)">更新</button>
                      <button class="ui-btn ui-btn--danger ui-btn--xs" type="button" @click="delList(cl.id)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <!-- ============ 弹窗：添加/编辑外部列表 ============ -->
      <AppModal v-model="showList" :title="listForm.clId ? '编辑外部列表' : '添加外部列表'">
        <div class="ui-field">
          <label class="ui-field__label">分类名称</label>
          <input v-model="listForm.listname" class="ui-input" placeholder="分类名称" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">列表链接</label>
          <input v-model="listForm.listurl" class="ui-input" placeholder="请输入列表链接" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">User-Agent</label>
          <input v-model="listForm.listua" class="ui-input" placeholder="Go-http-client/1.1" @keyup.enter="saveList" />
          <small class="ui-help">APTV源的UA样例为: AptvPlayer/1.4.10</small>
        </div>

        <!-- 更新间隔：新增时**必须**在这里填 —— 源还没有 id，没法先建再调 -->
        <div class="ui-field">
          <label class="ui-field__label">更新间隔</label>
          <div class="ui-inline u-gap-8">
            <input
              v-model.number="listForm.interval"
              class="ui-input"
              style="width: 96px"
              type="number"
              min="1"
              step="1"
              aria-label="更新间隔（小时）"
            />
            <span class="u-text-sm u-text-2">小时（默认 2）</span>
          </div>
          <small class="ui-help">该源自动抓取列表的周期，按源独立；列表页那一格可以随时直接改，「自动更新」开关也在那里</small>
        </div>

        <div class="ui-field">
          <label class="ui-check"><input v-model="listForm.autoCategory" type="checkbox" /><span>启用自动分组</span></label>
          <label class="ui-check" style="margin-left: 12px">
            <input v-model="listForm.autoGroup" type="checkbox" :disabled="!listForm.autoCategory" /><span>二级分组</span>
          </label>
          <label class="ui-check" style="margin-left: 12px">
            <input v-model="listForm.ku9" type="checkbox" :disabled="!listForm.autoCategory" /><span>TXT参数保留</span>
          </label>
          <small class="ui-help">
            支持 txt 格式 #genre# 分组、支持 m3u8 格式 group-title 分组；二级分组仅支持酷9的txt格式 #group# 分组，
            将分组名改为「分组名[一级分组](订阅源名称)」格式；TXT参数保留仅支持保留酷9等txt订阅分组附加参数
          </small>
        </div>

        <div class="ui-field">
          <label class="ui-check"><input v-model="listForm.dedup" type="checkbox" /><span>启用去重</span></label>
          <small class="ui-help">更新源数据时，判断频道链接是否和手动添加的列表重复</small>
        </div>

        <div class="ui-field u-mb-0">
          <label class="ui-check"><input v-model="listForm.autoRename" type="checkbox" /><span>频道重命名</span></label>
          <small class="ui-help">当频道绑定EPG时，订阅及app观看将如 CCTV-1、CCTV1、CCTV综合 等统一为 CCTV1</small>
        </div>

        <template #footer>
          <button class="ui-btn" type="button" @click="showList = false">关闭</button>
          <button class="ui-btn ui-btn--primary" type="button" @click="saveList">确定</button>
        </template>
      </AppModal>
    </template>

    <!-- 标签：频道分组（默认）—— 分组增删改、排序、频道与 EPG 维护 -->
    <template v-else>
      <!-- ============ B. 频道分组管理 ============ -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>频道分组管理</h4>
          <span class="ui-hint">双击任意一行可编辑</span>
        </div>

        <div class="ui-card__toolbar">
          <div class="ui-inline u-gap-8">
            <button class="ui-btn ui-btn--primary ui-btn--sm" type="button" @click="openAddCa">新增分组</button>

            <button class="ui-btn ui-btn--sm" type="button" @click="fileInput.click()">文件导入</button>
            <input ref="fileInput" type="file" style="display: none" @change="onPayListFile" />
          </div>
          <span class="u-text-sm u-text-2">拖动左侧手柄可调整分组顺序</span>
        </div>

        <div class="ui-card__body ui-card__body--flush">
          <div class="ui-table-wrap">
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="u-center" style="width: 56px">排序</th>
                  <th class="u-center">分组名称</th>
                  <th class="u-center" style="width: 110px">分组类型</th>
                  <th class="u-center" style="width: 80px">状态</th>
                  <!-- 「中转访问」列只在"已授权 && 全局中转已开"时存在（showProxy）。
                       列会消失，所以下面两处 colspan 必须跟着算，别写死 7。 -->
                  <th v-if="showProxy" class="u-center" style="width: 90px">中转访问</th>
                  <th class="u-center" style="width: 110px">频道重命名</th>
                  <th class="u-center" style="width: 240px">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td :colspan="showProxy ? 7 : 6" class="ui-table__status"><span class="ui-spinner" />正在加载频道分组…</td>
                </tr>
                <tr v-else-if="!categories.length">
                  <td :colspan="showProxy ? 7 : 6" class="ui-table__empty">当前未有频道分组数据</td>
                </tr>
                <tr
                  v-for="c in categories"
                  :key="c.id"
                  :draggable="isDraggable(c)"
                  class="is-editable"
                  title="双击编辑该分组"
                  :class="{ 'is-dragging': dragId === String(c.id), 'is-drop-target': dropTargetId === String(c.id) }"
                  @dragstart="onDragStart(c, $event)"
                  @dragover="onDragOver(c, $event)"
                  @dragleave="onDragLeave(c)"
                  @drop="onDrop(c, $event)"
                  @dragend="onDragEnd"
                  v-rowtap="() => openEditCa(c)"
                >
                  <!-- 拖拽手柄取代了原来的勾选框：勾选只是为了"挑一条给按钮挪"，
                       改成拖拽之后这个中转步骤整个不需要了 -->
                  <td class="u-center">
                    <AppIcon
                      v-if="isSortable(c)"
                      name="grip"
                      :size="16"
                      class="drag-grip"
                      title="按住拖动调整顺序"
                      @mousedown="onHandleDown(c)"
                      @mouseup="onHandleUp"
                      @mouseleave="onHandleUp"
                    />
                    <span v-else class="drag-grip is-locked" title="默认分类固定在最上，不可调整">—</span>
                  </td>
                  <td class="u-center">{{ c.name }}</td>
                  <td class="u-center">{{ TYPE_LABEL[c.type] || c.type }}</td>
                  <td class="u-center" @dblclick.stop>
                    <Switch
                      :model-value="!!(c.enable)"
                      :aria-label="!!(c.enable) ? '点击下线' : '点击上线'"
                      @update:model-value="toggleCaStatus(c)"
                    />
                  </td>
                  <!-- 中转访问（仅在 showProxy 时才有这一格）/ 频道重命名：与「状态」列 -->
                  <td v-if="showProxy" class="u-center" @dblclick.stop>
                    <Switch
                      :model-value="!!(c.proxy)"
                      :disabled="isAutoType(c)"
                      :aria-label="isAutoType(c) ? '聚合分组固定开启中转，不可关闭' : (!!(c.proxy) ? '点击关闭中转访问' : '点击开启中转访问')"
                      @update:model-value="toggleCaFlag(c, 'proxy')"
                    />
                  </td>
                  <td class="u-center" @dblclick.stop>
                    <Switch
                      :model-value="!!(c.autoRename)"
                      :aria-label="!!(c.autoRename) ? '点击关闭频道重命名' : '点击开启频道重命名'"
                      @update:model-value="toggleCaFlag(c, 'autoRename')"
                    />
                  </td>
                  <td class="u-center" @dblclick.stop>
                    <div class="ui-table__actions">
                      <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="openTxt(c)">编辑频道</button>
                      <!-- 「EPG管理」= 那张"分组 → 它的频道"的表：台标上传/更换/删除 -->
                      <!-- 与频道顺序拖拽都在里面（落点 chSort / uploadLogo）。 -->
                      <!-- 名字沿用原版后台的叫法，别简化成"管理"—— 页面上同时存在…… -->
                      <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="getChannels(c.id, c.name, c.type)">EPG管理</button>
                      <button class="ui-btn ui-btn--danger ui-btn--xs" type="button" @click="delCa(c.id)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <!-- ============ 弹窗：分组编辑 ============ -->
      <AppModal v-model="showCa" :title="caForm.caId ? '编辑分组' : '新增分组'">
        <div class="ui-field">
          <label class="ui-field__label">分组名称</label>
          <input v-model="caForm.caname" class="ui-input" placeholder="分组名称" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">User-Agent</label>
          <input v-model="caForm.caua" class="ui-input" placeholder="Go-http-client/1.1" />
        </div>

        <!-- 「开启中转」与列表里那一列同判据：已授权 && 全局中转已开（showProxy）。
             全局中转关着时这里提交 proxy:true 也不会生效，画出来只会误导。 -->
        <div v-if="showProxy" class="ui-field">
          <label class="ui-switch">
            <input v-model="caForm.proxy" type="checkbox" :disabled="isAutoCa" />
            <span class="ui-switch__track" />
            <span>开启中转</span>
          </label>
          <small v-if="isAutoCa" class="ui-help">聚合分组的频道没有自己的源，固定开启中转且不可关闭。</small>
        </div>

        <div class="ui-field">
          <label class="ui-switch">
            <input v-model="caForm.autoRename" type="checkbox" />
            <span class="ui-switch__track" />
            <span>频道重命名</span>
          </label>
          <small class="ui-help">当频道绑定EPG时，订阅及app观看将如 CCTV-1、CCTV1、CCTV综合 等统一为 CCTV1</small>
        </div>

        <div class="ui-field">
          <label class="ui-field__label">额外参数</label>
          <textarea
            v-model="caForm.ku9"
            class="ui-textarea"
            rows="3"
            placeholder="酷9 txt格式源分组额外参数 DE=解码#SC=画面比例#HEADERS=请求头#JS=Js路径#PB=回放参数#HOST=Host#PBO=回放偏移值#IJKAD=Ijk_Analyzeduration#TSO=时移结束时间增加值"
          />
        </div>

        <template v-if="showAuto">
          <div class="ui-field">
            <label class="ui-check">
              <input
                type="checkbox"
                :checked="autoMode === 'autoRe'"
                @change="autoMode = autoMode === 'autoRe' ? '' : 'autoRe'"
              />
              <span>正则聚合</span>
            </label>
            <label class="ui-check" style="margin-left: 12px">
              <input
                type="checkbox"
                :checked="autoMode === 'autoEpgs'"
                @change="autoMode = autoMode === 'autoEpgs' ? '' : 'autoEpgs'"
              />
              <span>EPG聚合</span>
            </label>
            <small class="ui-help">
              提取所有符合自动聚合规则的频道到该分组，频道所在的原分组不受影响。
              注意：当前分组如果已有频道，将会全部清空！
            </small>
          </div>

          <div v-if="autoMode === 'autoRe'" class="ui-field">
            <input v-model="caForm.rulesRe" class="ui-input ui-input--mono" placeholder="正则表达式" />
          </div>

          <div v-if="autoMode === 'autoEpgs'" class="ui-field">
            <TagSelect
              v-model="ruleEpgs"
              :options="epgOptions"
              placeholder="选择聚合的EPG"
              filterable
              direction="up"
            />
          </div>
        </template>

        <template #footer>
          <button class="ui-btn" type="button" @click="showCa = false">关闭</button>
          <button class="ui-btn ui-btn--primary" type="button" @click="saveCa">确定</button>
        </template>
      </AppModal>

      <!-- ============ 弹窗：编辑频道（频道列表） ============ -->
      <!-- 普通分组：源地址视图**可编辑**（改内容 / 调顺序 / 增删行，点「保存」 -->
      <!-- 整表提交，POST /api/channels/chImport，文本即真值 —— 行的先后就是最终…… -->
      <AppModal v-model="showTxt" title="编辑频道" size="lg">
        <div class="ui-field">
          <label class="ui-field__label">分组名称</label>
          <div class="ui-ro">{{ txtForm.caname }}</div>
        </div>

        <div class="ui-field u-mb-0">
          <div class="ui-inline u-mb-8">
            <label class="ui-field__label u-mb-0">URL</label>
            <!-- 分组没开中转、或**全局中转没开**时这个按钮没有意义（切过去只会看到 -->
            <!-- 一片空：purl 只在 category.Proxy 且全局中转开启这两条同时成立时才 -->
            <!-- 生成）—— 所以按需求直接不画它。showProxy 就是"全局中转已开且已授权"，…… -->
            <button
              v-if="txtForm.proxy && showProxy"
              class="ui-btn ui-btn--info ui-btn--xs"
              type="button"
              @click="toggleView"
            >
              {{ viewProxy ? '显示源地址' : '显示中转地址' }}
            </button>
            <!-- 提示与分组是否开中转无关：**没开中转的分组里也能切换行状态**，
                 所以这行提示不能挂在 txtForm.proxy 上，否则最需要提示的地方反而没有。 -->
            <span class="ui-hint">
              {{ txtAuto
                ? (viewProxy
                  ? '本聚合分组的中转入口，只读；来源分组没开中转且没配自定义 UA 的频道显示源地址'
                  : '聚合分组的频道由规则生成，不可编辑；地址按所属分组是否开启中转显示')
                : (viewProxy
                  ? '中转地址为只读，仅供查看与复制'
                  : '可直接改内容、调顺序、增删行；停用/启用点行号区的按钮，保存时一并写入') }}
            </span>
          </div>

          <!-- 行号列 / 停用行高亮 / 行号区停用切换 / 右上角复制按钮都在这个组件里。 -->
          <!-- 源地址视图可编辑、中转视图只读，两者只差一个 `readonly`； -->
          <!-- `toggleable` **独立于只读** —— 这个弹窗要的正是"内容能改、…… -->
          <LineNumberedTextarea
            ref="chanEditor"
            :model-value="editText"
            :readonly="viewProxy || txtAuto"
            :off-lines="activeOffLines"
            :toggleable="!viewProxy && !txtAuto"
            :line-tips="lineTips"
            :rows="15"
            :placeholder="viewProxy ? '该分组暂无中转地址' : '该分组暂无频道'"
            copy-title="复制可用频道"
            copy-label="复制未停用的频道"
            @update:model-value="editText = $event"
            @toggle-off="toggleOffLine"
          />

          <!-- 说明只留"怎么看、怎么操作"这一句（2026-09-22 按需求精简）：
               顺序/重排/落库时机那些细节靠界面本身表达，堆在弹窗底部反而没人读。 -->
          <small class="ui-help">
            {{ txtAuto
              ? '格式：频道名称,URL（每行一条）；把鼠标移到某一行上，可看到该地址来自哪个分组；点「显示中转地址」可对照本聚合分组自己的中转入口。'
              : '格式：频道名称,URL（每行一条），禁用行整行标红；把鼠标移到行号上可切换停用/启用。' }}
          </small>
        </div>

        <template #footer>
          <button class="ui-btn" type="button" @click="showTxt = false">关闭</button>
          <!-- 中转视图没有可保存的东西（只读）、聚合分组也没有可写的库记录 → 不画保存按钮 -->
          <button
            v-if="!viewProxy && !txtAuto"
            class="ui-btn ui-btn--primary"
            type="button"
            :disabled="savingChs"
            @click="saveChannels"
          >
            保存
          </button>
        </template>
      </AppModal>

      <!-- ============ 弹窗：管理（频道列表） ============ -->
      <!-- 这张表承担三件"改数据"的事：频道顺序的拖拽调整（落点 channels/chSort）、 -->
      <!-- 台标的上传/更换/删除（入口在 LOGO 列内，与 EPG列表 同一套 ——…… -->
      <AppModal v-model="showListModal" :title="`频道列表${chCaName ? ' - ' + chCaName : ''}`" size="xl">
        <div class="ui-table-wrap" style="max-height: 60vh">
          <table class="ui-table ui-table--bordered">
            <thead>
              <tr>
                <!-- 排序列只在**可排序**的分组（非聚合）里画：聚合分组的频道是引擎 -->
                <th v-if="canSortCh" class="u-center" style="width: 56px">排序</th>
                <th class="u-center">频道名称</th>
                <!-- 「来源分组」= 这条频道的 category_id 指向哪个分组（后端 -->
                <!-- `ca.name AS ca_name`）。普通分组里它恒等于本分组名；真正 -->
                <!-- 有用的是**聚合分组** —— 那儿的频道是从好几个分组捞过来的，…… -->
                <th class="u-center" style="width: 120px">来源分组</th>
                <th class="u-center ch-url-col">URL</th>
                <th class="u-center" style="width: 80px">状态</th>
                <th class="u-center" style="width: 100px">分辨率</th>
                <!-- 延迟 = iptv_channels.speed（引擎测速写入，api 原样下发）。 -->
                <th class="u-center" style="width: 90px">延迟</th>
                <th class="u-center" style="width: 180px">EPG</th>
                <th class="u-center" style="width: 110px">LOGO</th>
                <th class="u-center" style="width: 190px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="chLoading">
                <td :colspan="canSortCh ? 10 : 9" class="ui-table__status"><span class="ui-spinner" />正在加载频道…</td>
              </tr>
              <tr v-else-if="!chList.length">
                <td :colspan="canSortCh ? 10 : 9" class="ui-table__empty">暂无频道数据</td>
              </tr>
              <tr
                v-for="ch in chList"
                :key="ch.id"
                :draggable="isDraggableCh"
                class="is-editable"
                :title="canSortCh ? '双击编辑该频道 EPG' : '双击查看该频道 EPG（聚合分组只读）'"
                :class="{ 'is-dragging': chDragId === String(ch.id), 'is-drop-target': chDropId === String(ch.id) }"
                @dragstart="onChDragStart(ch, $event)"
                @dragover="onChDragOver(ch, $event)"
                @dragleave="onChDragLeave(ch)"
                @drop="onChDrop(ch, $event)"
                @dragend="onChDragEnd"
                v-rowtap="() => openEditChannel(ch)"
              >
                <!-- 手柄：**按住**才允许拖（见 onChHandleDown）—— 整行 draggable 会把"选文字、点行内按钮"一起吃掉。
                     聚合分组的频道是规则算出来的、改 sort 不生效，手柄整格**不画**（与 thead 同判断）。 -->
                <td v-if="canSortCh" class="u-center">
                  <AppIcon
                    name="grip"
                    :size="16"
                    class="drag-grip"
                    title="按住拖动调整顺序"
                    @mousedown="onChHandleDown"
                    @mouseup="onChHandleUp"
                    @mouseleave="onChHandleUp"
                  />
                </td>
                <td>{{ ch.name }}</td>
                <td class="u-center u-text-sm">{{ ch.caName || '-' }}</td>
                <!-- URL 列悬停提示来源分组：聚合分组里这一列可能同时混着 -->
                <td
                  class="u-text-sm ch-url-col"
                  style="word-break: break-all"
                  :title="ch.caName
                    ? `来源分组：${ch.caName}` + (ch.proxy
                      ? '（已开启中转）'
                      : (ch.ua ? '（未开中转，配了自定义 UA —— 仍走中转）' : '（未开中转，直连源站）'))
                    : ''"
                >{{ ch.url }}</td>
                <td class="u-center" @dblclick.stop>
                  <Switch
                    :model-value="ch.status"
                    :aria-label="ch.status ? '点击停用' : '点击启用'"
                    @update:model-value="setChannelStatus(ch)"
                  />
                </td>
                <td class="u-center u-text-sm">{{ ch.resolution || '-' }}</td>
                <td class="u-center u-text-sm">
                  <span :class="latencyClass(ch.speed)">{{ latencyText(ch.speed) }}</span>
                </td>
                <td class="u-center u-text-sm">{{ ch.epgName || '-' }}</td>
                <!-- LOGO 列：与 EPG列表 的 logo 列同一套（.logo-cell* 在全局 -->
                <!-- style.css 里，两处共用）。没绑定 EPG 时点上传会明确提示， -->
                <!-- 因为台标是按 EPG **名称** 定位、挂在 EPG 上的。…… -->
                <td class="u-center" @dblclick.stop>
                  <div v-if="ch.logo" class="logo-cell">
                    <img
                      :src="ch.logo"
                      alt=""
                      class="logo-cell__img"
                      title="点击放大查看"
                      @click.stop="zoomChLogo(ch)"
                    />
                    <span class="logo-cell__del" title="删除台标" @click="deleteChLogo(ch)">&times;</span>
                  </div>
                  <button v-else class="logo-cell__add" type="button" title="上传台标（仅 PNG）" @click="pickChLogo(ch)">
                    <AppIcon name="image" :size="13" />
                    <span>上传</span>
                  </button>
                </td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <!-- 「测试」= 延迟 + 分辨率一次测完（引擎那边同一条动作： -->
                    <button
                      class="ui-btn ui-btn--xs"
                      type="button"
                      :disabled="chTestId !== null"
                      :title="chTestId === ch.id ? '正在测速与分辨率…' : '测试该频道的延迟与分辨率'"
                      @click="testResolution(ch)"
                    >
                      {{ chTestId === ch.id ? '测试中…' : '测试' }}
                    </button>
                    <!-- 聚合分组的频道由规则算出、库里没有对应行，删除必然失败
                         → 直接禁用（title 说明原因），别让用户点了才被后端拒。 -->
                    <button
                      class="ui-btn ui-btn--danger ui-btn--xs"
                      type="button"
                      :disabled="!canSortCh"
                      :title="canSortCh ? '删除该频道' : '聚合分组的频道由规则生成，不能单独删除'"
                      @click="deleteChannel(ch)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 台标文件选择器：行内的「上传 / 更换」共用它（目标行记在 chLogoCh） -->
        <input ref="chLogoInput" type="file" accept="image/png" style="display: none" @change="onChLogoUpload" />

        <template #footer>
          <button class="ui-btn" type="button" @click="showListModal = false">关闭</button>
        </template>
      </AppModal>

      <!-- ============ 弹窗：单条频道 EPG 编辑 ============ -->
      <!-- 聚合分组（`canSortCh === false`）**整体只读**：它的频道是引擎按规则现算的、 -->
      <!-- 库里没有对应行，改完点「确定」只会被后端拒（ImportChannels / saveOne 对这类…… -->
      <AppModal v-model="showEditCh" :title="canSortCh ? 'EPG编辑' : 'EPG编辑（只读）'">
        <p v-if="!canSortCh" class="ui-help u-mb-8">
          本分组为<b>聚合分组</b>，频道由规则生成、不落库，因此不可修改；此处仅供查看。
        </p>
        <div class="ui-field">
          <label class="ui-field__label">频道名称</label>
          <input v-model="chForm.chname" class="ui-input" placeholder="频道名称" :readonly="!canSortCh" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">URL</label>
          <input
            v-model="chForm.chURL"
            class="ui-input ui-input--mono"
            placeholder="URL"
            :readonly="!canSortCh"
            @keyup.enter="canSortCh && saveChannelOne()"
          />
        </div>
        <!-- 台标**不在这里**：台标是"列"的语义（一个频道对应它绑定 EPG 的台标）， -->
        <!-- 入口统一放在「管理」表格的 LOGO 列内（见 pickChLogo / onChLogoUpload）。 -->
        <!-- 原来这里有一个「上传台标」按钮，本弹窗又是从那张表双击打开的 ——…… -->
        <div class="ui-field u-mb-0">
          <label class="ui-field__label">EPG</label>
          <TagSelect
            v-model="chForm.eId"
            :options="epgOptions"
            :multiple="false"
            placeholder="选择绑定EPG"
            :filterable="canSortCh"
            :disabled="!canSortCh"
          />
        </div>

        <template #footer>
          <button class="ui-btn" type="button" @click="showEditCh = false">关闭</button>
          <!-- 聚合分组不给「确定」：改了也不会生效（后端直接拒），
               画出来只会让用户白改一屏内容再被拒。 -->
          <button v-if="canSortCh" class="ui-btn ui-btn--primary" type="button" @click="saveChannelOne">确定</button>
        </template>
      </AppModal>
    </template>
  </div>
</template>

<style scoped>
/* ---------- 拖拽排序 ---------- */
/* 手柄平时是淡的，鼠标移到行上才明显 —— 否则一列灰色图标会把表格压得比数据还抢眼 */
.drag-grip {
  color: var(--muted-foreground);
  opacity: .45;
  cursor: grab;
  vertical-align: middle;
  transition: opacity .15s, color .15s;
}
tr:hover .drag-grip { opacity: 1; }
.drag-grip:active { cursor: grabbing; }
/* 默认分类不可拖：给一个更弱的占位符，明确"这里没有手柄" */
.drag-grip.is-locked {
  cursor: default;
  opacity: .25;
  user-select: none;
}
tr.is-dragging { opacity: .5; }
/* 落点提示用上边框：拖拽的语义是"插到这一行之前"，
   整行高亮会被读成"替换它" */
tr.is-drop-target > td { border-top: 2px solid var(--foreground); }

/* 频道列表弹窗：URL 列的最小宽度 */
.ch-url-col { min-width: 220px; }

/* 窄屏（手机竖屏）再收一档：上面那条 220px 会让 URL 列整体落到视口右侧之外 */
@media (max-width: 640px) {
  .ch-url-col { min-width: 170px; }
}
</style>
