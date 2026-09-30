<script setup>
// 下载页编辑（定制授权专属，系统分组）—— 自定义下载页的开关 + 站点文件管理。
//
// 「打开」= 引擎把源码渲染到 /config/dl/site，nginx 优先取它；
// 「关闭」= 删掉那个目录，nginx 自动回退默认下载页 —— 都不是重启，
// 所以开关一改就能立刻在浏览器里看到效果（详见引擎 service/customDlService.go）。
//
// 六个占位符在渲染时被替换：{APK_URL}/{MYTV_URL}/{CUSTOM_URL} 是下载地址，
// {APK_NAME}/{MYTV_NAME}/{CUSTOM_NAME} 是 APK 名称（不含版本号与类型后缀）。
// 页面里的相对引用（src/href/url()）会被自动改写成 /dl/ 前缀，
// 所以子目录里的资源放在本地相对位置即可，不用自己写 /dl/。
import { ref, computed, onMounted } from 'vue'
import AppModal from '@/components/AppModal.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { post } from '@/api/http'
import { submitAction, submitSwitch, submitUpload } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API, DL_ROUTES } from '@/api/endpoints'

/* ---- 开关与占位符（来自 dl/status）---- */
const enabled = ref(false)
const active = ref(false)
const count = ref(0)
const licOk = ref(false)
const names = ref({
  apk_url: '', mytv_url: '', custom_url: '',
  apk_name: '', mytv_name: '', custom_name: '',
})

/* ---- 默认下载页的四个按钮开关 ----
 * 存的是**配置里的开关值**，不是"最终会不会显示"——页面上的按钮还要 APK 文件存在
 * 才出得来，所以另外记一份产物状态（exists），把"为什么没显示"写在提示里。 */
const buttons = ref({ show_camel: true, show_mytv: true, show_custom: true, show_admin: true })
const exists = ref({ camel: false, mytv: false, custom: false })

/* ---- 入口文件探测 ---- */
// hasIndex 是「站点根有没有 index.html」—— 引擎的生效判据就是它（service/customDlService.go
// 的 dlIndexName）。缺了它开关打不开、页面也渲染不出来，所以进页面时要提醒一次。
const hasIndex = ref(true)
const indexNoticeOpen = ref(false)

/* ---- 目录浏览 ---- */
const curDir = ref('')
const entries = ref([])
const loading = ref(true)
const busy = ref(false)

const fileInput = ref(null)

/* ---- 编辑弹窗 ---- */
const editorOpen = ref(false)
const editPath = ref('')
const editContent = ref('')
const editBinary = ref(false)

/* ---- 改名 / 新建目录弹窗 ---- */
const renameOpen = ref(false)
const renameTarget = ref(null)
const renameValue = ref('')
const renameErr = ref('')

const mkdirOpen = ref(false)
const mkdirValue = ref('')
const mkdirErr = ref('')

/** 面包屑：根 + 每一级，末级是当前目录。 */
const crumbs = computed(() => {
  if (!curDir.value) return []
  return curDir.value.split('/').filter(Boolean)
})

const statusBadge = computed(() => {
  if (!enabled.value) return { text: '已关闭（使用默认下载页）', cls: 'ui-badge--muted' }
  if (!active.value) return { text: '已开启，但尚未生效（缺少 index.html）', cls: 'ui-badge--warning' }
  return { text: '生效中', cls: 'ui-badge--success' }
})

/** 占位符表格的行 —— 给用户照着写自定义页面。
 *  表格只留「参数 / 说明」两列；当前取值不占列，挂在参数名的悬停 tip 上
 *  （1:2 分栏下左栏只有 1/3 宽，长 URL 塞不进任何一个单元格）。 */
const placeholderRows = computed(() =>
  [
    { key: '{APK_URL}', desc: '骆驼客户端 APK 下载地址', value: names.value.apk_url },
    { key: '{MYTV_URL}', desc: 'MyTV 客户端 APK 下载地址', value: names.value.mytv_url },
    { key: '{CUSTOM_URL}', desc: '定制客户端 APK 下载地址', value: names.value.custom_url },
    { key: '{APK_NAME}', desc: '骆驼客户端名称', value: names.value.apk_name },
    { key: '{MYTV_NAME}', desc: 'MyTV 客户端名称', value: names.value.mytv_name },
    { key: '{CUSTOM_NAME}', desc: '定制客户端名称', value: names.value.custom_name },
  ].map((r) => ({ ...r, tip: String(r.value ?? '').trim() || '当前未配置' }))
)

/** 「默认下载页按钮」的四行。hint 里带上"APK 编译出来没有"——
 *  文件不存在时按钮即使开着也不会显示，不说明的话看着就像开关失灵。 */
const buttonRows = computed(() => [
  {
    key: 'show_camel',
    label: '骆驼客户端下载按钮',
    hint: exists.value.camel
      ? `已编译：${names.value.apk_name || '（名称未知）'}`
      : '尚未编译出 APK —— 即使打开也不会显示',
  },
  {
    key: 'show_mytv',
    label: 'MyTV 客户端下载按钮',
    hint: exists.value.mytv
      ? `已编译：${names.value.mytv_name || '（名称未知）'}`
      : '尚未编译出 APK —— 即使打开也不会显示',
  },
  {
    key: 'show_custom',
    label: '定制客户端下载按钮',
    hint: exists.value.custom
      ? `已编译：${names.value.custom_name || '（名称未知）'}`
      : '尚未编译出 APK —— 即使打开也不会显示',
  },
  {
    key: 'show_admin',
    label: '进入后台的按钮',
    hint: '跳转到管理系统登录页，不依赖任何文件',
  },
])

/** 把 dl/status 的 buttons 段铺进本地状态。 */
function applyButtons(b) {
  if (!b || typeof b !== 'object') return
  buttons.value = {
    show_camel: b.show_camel !== false,
    show_mytv: b.show_mytv !== false,
    show_custom: b.show_custom !== false,
    show_admin: b.show_admin !== false,
  }
  exists.value = {
    camel: Boolean(b.camel_exists),
    mytv: Boolean(b.mytv_exists),
    custom: Boolean(b.custom_exists),
  }
}

function formatSize(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(sec) {
  if (!sec) return '-'
  const d = new Date(Number(sec) * 1000)
  const p = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------------- 取数 ---------------- */

// dl/status 是「取数」端点：成功回扁平对象，失败回 {code,msg,type} 信封
// （见 api/json.go 的 replyData）。扁平体里没有 code 字段，据此区分。
async function loadStatus() {
  const g = await post(API.adminDlStatus)
  if (!g || typeof g.code === 'number') {
    if (g?.msg) notify(g.msg, g.type || 'warning')
    return
  }
  enabled.value = Number(g.enabled ?? 0) === 1
  active.value = Boolean(g.active)
  count.value = Number(g.count ?? 0)
  licOk.value = Boolean(g.lic_ok)
  names.value = { ...names.value, ...(g.names || {}) }
  applyButtons(g.buttons)
}

// 站点根有没有 index.html。判据必须与引擎逐字一致（区分大小写）：
// 引擎查的是 filepath.Join(dlSrcDir, "index.html")，上传成 INDEX.HTML 一样不算数。
async function probeIndex() {
  try {
    const r = await post(DL_ROUTES.list, { path: '' })
    if (!r || Number(r.code) < 1) {
      hasIndex.value = true
      return
    }
    const list = Array.isArray(r.data) ? r.data : []
    hasIndex.value = list.some((e) => !e.dir && e.name === 'index.html')
  } catch {
    hasIndex.value = true // 探测失败不误报，宁可少提醒一次
  }
}

async function loadFiles() {
  loading.value = true
  try {
    const r = await post(DL_ROUTES.list, { path: curDir.value })
    entries.value = r?.code >= 1 ? (r.data || []) : []
    if (r?.code === 0 && r.msg) notify(r.msg, 'danger')
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadStatus(), loadFiles(), probeIndex()])
}

onMounted(async () => {
  await loadAll()
  // 「打开下载页编辑」时提醒一次：缺 index.html 的话开关根本打不开，
  // 光靠页面里的常驻小字用户看不见（原先是块 ui-alert，现已收进弹窗）。
  if (licOk.value && !hasIndex.value) indexNoticeOpen.value = true
})

/* ---------------- 开关 ---------------- */

async function onToggle(e) {
  const next = e.target.checked ? 1 : 0
  await submitSwitch(
    DL_ROUTES.toggle,
    { enabled: next },
    {
      apply: () => { enabled.value = next === 1 },
      revert: () => { e.target.checked = !e.target.checked },
      successMsg: '',
    }
  )
  // 开关会改变「是否生效」与占位符取值，按服务端事实重画一次
  await loadStatus()
}

/* ---- 默认下载页按钮开关 ---- */

/** 服务端是**整体覆盖写**（四个字段必带），所以每次改动把当前四个值一起发过去。 */
async function onToggleButton(key, e) {
  const next = e.target.checked
  const prev = { ...buttons.value }
  buttons.value = { ...prev, [key]: next }
  const on = (v) => (v ? 1 : 0)
  await submitSwitch(
    DL_ROUTES.buttons,
    {
      show_camel: on(buttons.value.show_camel),
      show_mytv: on(buttons.value.show_mytv),
      show_custom: on(buttons.value.show_custom),
      show_admin: on(buttons.value.show_admin),
    },
    {
      revert: () => {
        buttons.value = prev
        e.target.checked = !e.target.checked
      },
      successMsg: '已保存',
    }
  )
}

/* ---------------- 目录导航 ---------------- */

function openDir(path) {
  curDir.value = path || ''
  loadFiles()
}

function toCrumb(i) {
  openDir(crumbs.value.slice(0, i + 1).join('/'))
}

/* ---------------- 文件操作 ---------------- */

async function openEditor(entry) {
  const r = await post(DL_ROUTES.read, { path: entry.path })
  if (r?.code !== 1) {
    notify(r?.msg || '打开失败', 'danger')
    return
  }
  editPath.value = entry.path
  editBinary.value = Boolean(r.data?.binary)
  editContent.value = r.data?.content ?? ''
  editorOpen.value = true
}

async function saveEditor() {
  const r = await submitAction(DL_ROUTES.write, {
    path: editPath.value,
    content: editContent.value,
  })
  if (r?.code >= 1) editorOpen.value = false
}

function openRename(entry) {
  renameTarget.value = entry
  renameValue.value = entry.name
  renameErr.value = ''
  renameOpen.value = true
}

async function doRename() {
  const name = renameValue.value.trim()
  if (!name) { renameErr.value = '名称不能为空'; return }
  const r = await submitAction(DL_ROUTES.rename, { path: renameTarget.value.path, name })
  if (r?.code >= 1) {
    renameOpen.value = false
    // 目录改名会改掉当前路径，回到上级目录最稳
    if (curDir.value) curDir.value = curDir.value.split('/').slice(0, -1).join('/')
    await loadAll()
  } else {
    renameErr.value = r?.msg || '改名失败'
  }
}

async function doDelete(entry) {
  const kind = entry.dir ? '目录（含其中全部文件）' : '文件'
  const ok = await confirm(`确定删除${kind} ${entry.name} 吗？此操作不可恢复。`, {
    okText: '删除',
    okVariant: 'danger',
  })
  if (!ok) return
  const r = await submitAction(DL_ROUTES.delete, { path: entry.path })
  if (r?.code >= 1) await loadAll()
}

async function doMkdir() {
  const name = mkdirValue.value.trim()
  if (!name) { mkdirErr.value = '目录名不能为空'; return }
  if (name.includes('/')) { mkdirErr.value = '目录名不能包含 /'; return }
  const path = [curDir.value, name].filter(Boolean).join('/')
  const r = await submitAction(DL_ROUTES.mkdir, { path })
  if (r?.code >= 1) {
    mkdirOpen.value = false
    mkdirValue.value = ''
    await loadFiles()
  } else {
    mkdirErr.value = r?.msg || '创建失败'
  }
}

function pickFile() {
  if (busy.value) return
  fileInput.value?.click()
}

/** 提醒弹窗里的「上传 index.html」：先关弹窗再拉起文件选择，避免两层遮罩叠着。 */
function uploadIndex() {
  indexNoticeOpen.value = false
  pickFile()
}

/** 上传落地到「当前目录」，所以 path 是目录 + 文件名（引擎按整条相对路径落盘）。 */
async function onUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  busy.value = true
  try {
    const target = [curDir.value, file.name].filter(Boolean).join('/')
    await submitUpload(API.adminDlUpload, file, 'file', {
      fields: { path: target },
      // 走 loadAll：上传可能带来 index.html，得顺带把「有没有入口文件」重探一次
      reload: async () => { await loadAll() },
    })
  } finally {
    busy.value = false
    e.target.value = ''
  }
}
</script>

<template>
  <div class="dl-page">
    <!-- ============ 自定义下载页开关 ============ -->
    <div class="ui-card">
      <div class="ui-card__header"><h4>自定义下载页</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline dl-switchrow">
          <label class="ui-switch">
            <input type="checkbox" :checked="enabled" @change="onToggle" />
            <span class="ui-switch__track" />
          </label>
          <span class="ui-badge" :class="statusBadge.cls">{{ statusBadge.text }}</span>
          <span class="ui-badge ui-badge--muted">站点文件 {{ count }} 个</span>
        </div>
        <small class="ui-help">
          打开后访问下载页会展示下面这些源码渲染出的页面；关闭则回退到系统默认下载页。
          <b>开关切换立即生效，不需要重启或重新部署。</b>
        </small>

        <div class="ui-card__header dl-subtitle"><h4>可用参数</h4></div>
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th style="width: 34%">参数</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in placeholderRows" :key="row.key">
                <td>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <code class="dl-key dl-key--tip" tabindex="0">
                        {{ row.key }}
                      </code>
                    </TooltipTrigger>
                    <TooltipContent side="top" class="dl-tipbox">
                      <span class="dl-tipbox__in">
                        <span class="dl-tipbox__key">{{ row.key }} 当前取值</span>
                        <span class="dl-tipbox__val">{{ row.tip }}</span>
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td>{{ row.desc }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <small class="ui-help">
          APK 名称参数<b>不含版本号与类型后缀</b>（例如「清和IPTV」而不是「清和IPTV-mytv.apk」）。
        </small>

        <div class="ui-card__header dl-subtitle dl-subtitle--row">
          <h4>默认下载页按钮</h4>
          <span v-if="enabled" class="ui-badge ui-badge--warning">
            自定义下载页已开启，以下设置暂不生效
          </span>
        </div>
        <small class="ui-help">
          这几个开关只作用于<b>系统默认下载页</b>——也就是上面这个开关关闭时访问到的页面。
          下载按钮还要对应的 APK <b>已经编译出来</b>才会出现，两者缺一不可。
        </small>
        <div class="dl-switchlist">
          <div v-for="row in buttonRows" :key="row.key" class="dl-switchitem">
            <label class="ui-switch">
              <input
                type="checkbox"
                :checked="buttons[row.key]"
                @change="onToggleButton(row.key, $event)"
              />
              <span class="ui-switch__track" />
            </label>
            <span class="dl-switchitem__text">
              <span class="dl-switchitem__name">{{ row.label }}</span>
              <small class="dl-switchitem__hint">{{ row.hint }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 站点文件 ============ -->
    <div class="ui-card">
      <div class="ui-card__header"><h4>站点文件</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline dl-toolbar">
          <nav class="dl-crumbs" aria-label="当前目录">
            <button class="dl-crumb" type="button" @click="openDir('')">站点根目录</button>
            <template v-for="(c, i) in crumbs" :key="i">
              <span class="dl-crumb-sep">/</span>
              <button class="dl-crumb" type="button" @click="toCrumb(i)">
                {{ c }}
              </button>
            </template>
          </nav>
          <span class="dl-spacer" />
          <button class="ui-btn ui-btn--sm" type="button" :disabled="busy" @click="pickFile">
            {{ busy ? '上传中…' : '上传文件' }}
          </button>
          <button
            class="ui-btn ui-btn--sm"
            type="button"
            @click="mkdirOpen = true; mkdirValue = ''; mkdirErr = ''"
          >
            新建目录
          </button>
          <button class="ui-btn ui-btn--sm" type="button" @click="loadAll">刷新</button>
        </div>

        <input ref="fileInput" class="dl-file" type="file" @change="onUpload" />

        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th>名称</th>
                <th style="width: 110px">大小</th>
                <th style="width: 160px">修改时间</th>
                <th style="width: 220px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="4" class="ui-table__status"><span class="ui-spinner" />加载中…</td>
              </tr>
              <tr v-else-if="!entries.length">
                <td colspan="4" class="ui-table__empty">
                  这个目录还是空的，先上传一个 index.html 吧
                </td>
              </tr>
              <template v-else>
                <tr v-for="row in entries" :key="row.path">
                  <td>
                    <button
                      v-if="row.dir"
                      class="dl-name dl-name--dir"
                      type="button"
                      @click="openDir(row.path)"
                    >
                      📁 {{ row.name }}
                    </button>
                    <span v-else class="dl-name">{{ row.name }}</span>
                  </td>
                  <td>{{ row.dir ? '-' : formatSize(row.size) }}</td>
                  <td>{{ formatTime(row.mod) }}</td>
                  <td>
                    <div class="ui-table__actions">
                      <button
                        v-if="!row.dir"
                        class="ui-btn ui-btn--xs ui-btn--primary"
                        type="button"
                        @click="openEditor(row)"
                      >
                        编辑
                      </button>
                      <button
                        v-else
                        class="ui-btn ui-btn--xs"
                        type="button"
                        @click="openDir(row.path)"
                      >
                        打开
                      </button>
                      <button
                        class="ui-btn ui-btn--xs"
                        type="button"
                        :title="`重命名 ${row.name}`"
                        :aria-label="`重命名 ${row.name}`"
                        @click="openRename(row)"
                      >
                        改名
                      </button>
                      <button
                        class="ui-btn ui-btn--xs ui-btn--danger"
                        type="button"
                        :title="`删除 ${row.name}`"
                        :aria-label="`删除 ${row.name}`"
                        @click="doDelete(row)"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ============ 编辑源码 ============ -->
    <AppModal v-model="editorOpen" :title="`编辑 ${editPath}`" size="xl">
      <div v-if="editBinary" class="ui-alert ui-alert--warning">
        这是二进制文件，不能在浏览器里编辑。请用「上传文件」替换它。
      </div>
      <textarea
        v-else
        v-model="editContent"
        class="ui-textarea dl-editor"
        spellcheck="false"
        placeholder="在此粘贴页面源码…"
      />
      <small class="ui-help">
        保存后立即重新渲染，下载页会马上生效（开关为「生效中」时）。
      </small>
      <template #footer>
        <button class="ui-btn" type="button" @click="editorOpen = false">取消</button>
        <button
          class="ui-btn ui-btn--primary"
          type="button"
          :disabled="editBinary"
          @click="saveEditor"
        >
          保存
        </button>
      </template>
    </AppModal>

    <!-- ============ 重命名 ============ -->
    <AppModal v-model="renameOpen" title="重命名">
      <div class="ui-field">
        <label class="ui-field__label">新名称</label>
        <input v-model="renameValue" class="ui-input" type="text" @keyup.enter="doRename" />
        <small v-if="renameErr" class="dl-err">{{ renameErr }}</small>
      </div>
      <small class="ui-help">
        只能在同一目录内改名，不支持移动到别的目录。
      </small>
      <template #footer>
        <button class="ui-btn" type="button" @click="renameOpen = false">取消</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doRename">确定</button>
      </template>
    </AppModal>

    <!-- ============ 新建目录 ============ -->
    <AppModal v-model="mkdirOpen" title="新建目录">
      <div class="ui-field">
        <label class="ui-field__label">目录名</label>
        <input v-model="mkdirValue" class="ui-input" type="text" @keyup.enter="doMkdir" />
        <small v-if="mkdirErr" class="dl-err">{{ mkdirErr }}</small>
      </div>
      <small class="ui-help">建在当前目录下（{{ curDir || '站点根目录' }}）。</small>
      <template #footer>
        <button class="ui-btn" type="button" @click="mkdirOpen = false">取消</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doMkdir">确定</button>
      </template>
    </AppModal>
    <!-- ============ 缺 index.html 提醒（打开本页时按需弹一次） ============ -->
    <AppModal v-model="indexNoticeOpen" title="还缺少 index.html">
      <p class="dl-note">
        自定义下载页需要站点根目录下有一个名为 <code class="dl-key">index.html</code> 的入口文件，
        现在还没上传 —— <b>缺它的话开关打不开，页面也不会生效</b>。
      </p>
      <p class="dl-note">
        页面里的相对引用（<b>src</b> / <b>href</b> / <b>url()</b>）会被自动指向本站点目录，
        所以子目录里的 css/js/图片按相对路径放好即可。
      </p>
      <template #footer>
        <button class="ui-btn" type="button" @click="indexNoticeOpen = false">稍后再说</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="uploadIndex">
          上传 index.html
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* 桌面端 自定义下载页:站点文件 = 1:2 左右分栏。必须用 minmax(0,…)：
   裸 1fr 的 min 是 auto，左栏会被里面的表格撑破。窄屏回退单列，间距交给 gap。 */
.dl-page {
  display: grid;
  gap: 16px;
  align-items: start;
}
@media (min-width: 1280px) {
  .dl-page {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  }
}
/* 全局给相邻卡片加了 margin-top 16px（.ui-card + .ui-card，见 style.css:437），
   栅格里的间距一律由 gap 负责 —— 不清零的话右卡会整体下沉 16px、两卡顶边不齐。 */
.dl-page > .ui-card + .ui-card {
  margin-top: 0;
}
.dl-switchrow {
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.dl-note {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.75;
}
.dl-note:last-child {
  margin-bottom: 0;
}
.dl-subtitle {
  border-bottom: none;
  padding: 14px 0 6px;
}
/* 标题 + 右侧状态徽标（默认下载页按钮那一段用） */
.dl-subtitle--row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dl-switchlist {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}
.dl-switchitem {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.dl-switchitem__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dl-switchitem__name {
  font-size: 13px;
  color: var(--foreground);
}
.dl-switchitem__hint {
  font-size: 12px;
  color: var(--muted-foreground);
  word-break: break-all;
}
.dl-key {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--muted);
  font-size: 12px;
}
/* 参数名自带悬停 tip（当前取值），所以要给它可聚焦与手型提示。 */
.dl-key--tip {
  cursor: help;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.dl-key--tip:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
.dl-tipbox__in {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  max-width: 340px;
}
.dl-tipbox__key {
  font-size: 11px;
  opacity: 0.7;
}
.dl-tipbox__val {
  word-break: break-all;
}
.dl-toolbar {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.dl-spacer {
  flex: 1 1 auto;
}
.dl-crumbs {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  font-size: 13px;
}
.dl-crumb {
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
}
.dl-crumb:hover {
  background: var(--muted);
}
.dl-crumb-sep {
  color: var(--muted-foreground);
}
.dl-name {
  font-size: 13px;
}
.dl-name--dir {
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--foreground);
  cursor: pointer;
  font-weight: 500;
  text-align: left;
}
.dl-name--dir:hover {
  background: var(--muted);
}
.dl-file {
  display: none;
}
.dl-err {
  color: var(--c-danger);
  font-size: 12px;
}
.dl-editor {
  min-height: 46vh;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
