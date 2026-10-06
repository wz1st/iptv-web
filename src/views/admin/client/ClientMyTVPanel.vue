<script setup>
// MyTV 客户端设置 —— 与骆驼 ClientPanel 同一套「编译 → 待发布 → 发布」三段，
// 差异只有四点（其余渲染/轮询/发布逻辑照骆驼复刻）：
//   1. 编译在**引擎**里执行（WS buildMyTV），apktool 解包编译基底 APK；
//   2. APK 连接地址是 mytv **独立**的（cfg.MyTV.ServerUrl），不与骆驼共用；
//   3. 更新内容可配置（骆驼写死在 until.FixedUpdateText）；
//   4. 编译基底 APK 可上传替换（落 /config/mytv，包名须与镜像内底包一致）。
// 数据源：POST /api/clientMyTV/data（一次给全线上包与待发布包的版本号/大小/MD5/下载地址）
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitUpload } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { isCoarsePointer } from '@/utils/touchTap'
import { API, MYTV_ROUTES } from '@/api/endpoints'

const d = ref(null)
const loading = ref(true)

/* ---- 编译配置 ---- */
const serverUrl = ref('')
const urlLocked = ref(true)
const upBody = ref('')

/* ---- 编译基底（底包）---- */
// baseVersion 是基底版本（1.2.2），basePkg 是镜像内底包的包名（xyz.qingh.mytv）。
// 上传校验就按 basePkg 判：包名不一致的 APK 一律拒收（见 service.UploadMytvBaseApk）。
const baseVersion = ref('')
const basePkg = ref('')
const uploading = ref(false)
const baseInput = ref(null)

/* ---- 编译基底的检测更新 / 手动上传（远端 mytv-vX.Y.Z 序列）---- */
// 两个按钮分工：「检测更新」先查发布仓的 mytv-vX.Y.Z 序列，远端更新时走**与在线升级完全
// 同一段**逻辑（确认 → 后端下载并替换）；「手动上传」由用户自选 APK 覆盖底包。
// GitHub 直连失败或延迟过大时后端自动切国内加速，实际链路随结果一起回显（直连 / gh-proxy.org / hk.gh-proxy.com）。
const checking = ref(false)
const upgrading = ref(false)

/* ---- 两张卡片的数据：线上包 / 待发布包，各四件（版本号、大小、MD5、下载地址）---- */
const currentVersion = ref('')
const curSize = ref('')
const curMd5 = ref('')
const apkUrl = ref('')
const apkName = ref('')
const newVersion = ref('')
const newSize = ref('')
const newMd5 = ref('')
const newExists = ref(false)
const newApkUrl = ref('')
const newApkName = ref('')

const building = ref(false)
let pollTimer = null

/** 线上包是否已产出：GetFileSize 取不到时回的是 "0 MB" */
const hasCurrent = computed(() => Boolean(curSize.value) && curSize.value !== '0 MB')
// 待发布包现在能不能用。
// 编译中即便文件已经出现也不能用 —— 那一刻它还在被 apktool 写入，
// 下载下来是个半截包，md5 也还在变。所以"存在"之外还要 `!building`。
const canUseNew = computed(() => newExists.value && !building.value)

// 新版本的编译号 = 当前版本末段数字 +1（新编版本号最后一位自动加1）。
// mytv 版本号是「基底版本.编译号」（1.2.2.012），编译号是 1-999 的纯数字。
// **必须补足三位**：底包 versionName 的末段就是三位（1.2.2.001），编译时
// 是二进制 manifest 里的定长字节替换，新旧串不等长就把 manifest 写坏；
// 另外客户端按字符串比版本，不补零时 1.2.2.9 会被判成比 1.2.2.12 新。
function pad3(n) {
  return String(n).padStart(3, '0')
}
function nextBuildNo(v) {
  const m = String(v ?? '').match(/(\d+)$/)
  const n = m ? Number(m[1]) + 1 : 1
  return pad3(Math.min(n, 999))
}
/** 线上版本的**编译号**（末段）；线上版本号不带基底前缀时按"还没编过"处理。 */
function currentBuildNo() {
  const base = String(baseVersion.value || '')
  const cur = String(currentVersion.value || '')
  // 线上版本号必须是 `基底.编译号` 才认它的末段。换基底后旧版本号
  // （1.0.0.005 vs 新基底 2.0.0）不匹配 ⇒ 返回空串，编译号由
  // nextBuildNo('') 落到 001 —— 新基底的第一版就该是 2.0.0.001。
  if (!base || !cur.startsWith(base + '.')) return ''
  return (cur.match(/(\d+)$/) || ['', ''])[1]
}
// nextVersionFull 是给徽章看的完整版本串（1.2.2.012 → 1.2.2.013）。
// 还没发布过任何版本时（线上包不存在）用基底版本兜底，显示 1.2.2.001。
const nextVersionFull = computed(() => {
  const base = String(baseVersion.value || '')
  if (!base) return ''
  return `${base}.${nextBuildNo(currentBuildNo())}`
})

async function load() {
  loading.value = true
  try {
    const g = (await post(API.adminClientMyTVData)) || {}
    d.value = g
    serverUrl.value = g.serverUrl || ''
    upBody.value = g.update || ''
    baseVersion.value = g.baseVersion || ''
    basePkg.value = g.basePkg || ''
    currentVersion.value = g.version || ''
    curSize.value = g.size || ''
    curMd5.value = g.md5 || ''
    apkUrl.value = g.apkUrl || ''
    apkName.value = g.apkName || ''
    newVersion.value = g.newVersion || ''
    newSize.value = g.newSize || ''
    newMd5.value = g.newMd5 || ''
    newExists.value = Boolean(g.newExists)
    newApkUrl.value = g.newApkUrl || ''
    newApkName.value = g.newApkName || ''
    building.value = Number(g.status ?? 0) === 1
    if (building.value) startPolling()
  } catch { /* http.js 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

/* ---------------- 双击输入框解锁 APK 连接地址 ---------------- */
async function unlockUrl() {
  if (!urlLocked.value) return
  const ok = await confirm('修改APK连接地址后，需要重新构建APK，且之前APK可能出现网络连接失败，确认修改吗？', {
    okText: '确认',
    okVariant: 'danger',
  })
  if (!ok) return
  urlLocked.value = false
  serverUrl.value = window.location.origin
}

/* 触摸设备上"双击"不可靠（会被当成缩放），所以单击输入框也解锁。
   只在主指针是触摸时生效 —— 桌面上单击输入框要能正常聚焦/选字。 */
function onUrlTap() {
  if (urlLocked.value && isCoarsePointer()) unlockUrl()
}

/* ---------------- 编译基底：上传替换底包 ----------------
   底包落 /config/mytv（持久卷），**不覆盖镜像里的 /app/mytv** —— 那是镜像层，
   重拉镜像就还原，用户白传一场。上传后引擎编译取的就是这份。
   三道校验全在后端：扩展名 → 包名必须与镜像内底包一致 → 版本号可提取。
   前端的责任只是把「该传哪个包」提前写清楚，别让用户传上去被拒了才知道。 */
function pickBaseApk() {
  if (uploading.value) return
  baseInput.value?.click()
}

async function onBaseApkUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    // 基底换了 ⇒ 基底版本、待发布包状态全变，直接按服务端事实重画整个面板
    await submitUpload(API.adminClientMyTVUploadBase, file, 'apkfile', { reload: load })
  } finally {
    uploading.value = false
    // 清空才能重复选同一个文件（否则第二次 change 不触发）
    e.target.value = ''
  }
}

/* ---------------- 编译基底：检测更新（查 + 升级共用一个入口）----------------
   远端是发布仓里的 mytv-vX.Y.Z 序列（与 api/引擎同仓不同前缀）。
   查完分三种出口：无发布只提示、已最新只提示、有更新就走与在线升级**完全相同**的那一段。 */
async function detectBaseUpdate() {
  if (checking.value || upgrading.value) return
  checking.value = true
  let c = null
  try {
    // silent：结果由下面三种出口自己报，别再多一条通用成功提示
    const res = await submitAction(API.adminClientMyTVCheckBase, {}, { silent: true })
    c = res?.data
    if (!c) { notify(res?.msg || '检测更新失败：GitHub 直连与国内加速都不通', 'danger', 4000); return }
  } finally {
    checking.value = false
  }

  const route = c.route ? `，经 ${c.route}` : ''
  if (!c.remote) { notify(`远端还没有基底发布（本地 ${c.local || '-'}）`, 'warning', 3000); return }
  if (!c.hasUpdate) { notify(`已是最新（本地 ${c.local || '-'}，远端 ${c.remote}）${route}`, 'success', 3000); return }
  await upgradeBase(c)
}

/* ---------------- 编译基底：在线升级 ----------------
   下载与替换都在后端做（校验包名与版本号那一套与手动上传共用），
   下载可能要走慢链路，所以用 submitAction 的全屏 loading 兜住这几分钟。 */
async function upgradeBase(c) {
  const ok = await confirm(
    `确定把编译基底从 ${c.local || '当前版本'} 升级到 ${c.remote} 吗？升级后当前待发布包会作废，需要重新编译并发布。`,
    { okText: '升级', okVariant: 'danger' }
  )
  if (!ok) return

  upgrading.value = true
  try {
    await submitAction(API.adminClientMyTVUpgradeBase, {}, { reload: load })
  } finally {
    upgrading.value = false
  }
}

/* ---------------- 编译：只产出「待发布」包，线上一个字节都不动 ----------------
   版本号不提供输入框：编译号自动取「当前版本末段 +1」（新编版本号最后一位
   自动加1），与骆驼的新版本号自动 +1 同一交互。 */
async function buildApk() {
  if (!serverUrl.value) { notify('APK连接地址不能为空', 'warning'); return }
  // 编译号自动 +1；封顶 999 时会与已发布版本相同，由后端「版本号不能相同」兜底拒绝。
  // ★ 必须走 currentBuildNo()，不能直接对 currentVersion 取末段：
  // currentVersion 是**完整版本号**（1.2.2.012），换基底后它仍是旧基底的号，
  // 对它取末段会从旧基底继续递增。后端只接受纯数字编译号，传完整串会被拒。
  const appVersion = nextBuildNo(currentBuildNo())
  const res = await submitAction(MYTV_ROUTES.clientMyTV, {
    serverUrl: serverUrl.value,
    appVersion,
    upBody: upBody.value,
  })
  if (res?.code >= 1) {
    building.value = true
    startPolling()
  }
}

/* ---------------- 发布：把待发布包换成线上版本 ---------------- */
async function publishApk() {
  if (!canUseNew.value) { notify('请先编译新版本', 'warning'); return }
  const ok = await confirm(
    `确定把 ${newVersion.value} 发布上线吗？发布后当前版本与所有下载链接都会换成这个包。`,
    { okText: '发布', okVariant: 'danger' }
  )
  if (!ok) return
  // reload：版本号、大小、MD5、下载地址全变了，直接按服务端的事实重画两张卡片
  await submitAction(MYTV_ROUTES.publish, {}, { reload: load })
}

/** 1s 轮询编译状态 —— 与骆驼同一套：两张卡片同源刷新 */
function startPolling() {
  stopPolling()
  let requesting = false
  pollTimer = setInterval(async () => {
    if (requesting) return
    requesting = true
    try {
      const res = await post(API.adminClientMyTVBuildStatus)
      applyBuildStatus(res?.data)
      if (res?.code === 1) {
        notify(res.msg || 'APK编译完成', 'success', 1500)
        building.value = false
        stopPolling()
      }
    } catch {
      notify('请求失败，稍后重试...', 'danger', 1200)
    } finally {
      requesting = false
    }
  }, 1000)
}

// 用 buildStatus 的 data 刷新两张卡片（data 与 clientMyTV/data 同形状）。
// 编译中也要刷：体积在涨、md5 随写入变化，"编到哪了"就体现在这两个数上。
function applyBuildStatus(d) {
  if (!d) return
  if (d.version !== undefined) currentVersion.value = d.version || ''
  if (d.size !== undefined) curSize.value = d.size || ''
  if (d.md5 !== undefined) curMd5.value = d.md5 || ''
  if (d.apkUrl) apkUrl.value = d.apkUrl
  if (d.apkName) apkName.value = d.apkName
  if (d.newVersion !== undefined) newVersion.value = d.newVersion || ''
  if (d.newSize !== undefined) newSize.value = d.newSize || ''
  if (d.newMd5 !== undefined) newMd5.value = d.newMd5 || ''
  if (d.newExists !== undefined) newExists.value = Boolean(d.newExists)
  if (d.newApkUrl) newApkUrl.value = d.newApkUrl
  if (d.newApkName) newApkName.value = d.newApkName
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
onBeforeUnmount(stopPolling)
</script>

<template>
  <div v-if="loading" class="ui-alert ui-alert--info">
    <span class="ui-spinner" />正在加载 MyTV 配置…
  </div>

  <template v-else>
    <div class="ui-card">
      <div class="ui-card__header"><h4>MYTV编译配置</h4></div>
      <div class="ui-card__body">
        <!-- APK 连接地址：mytv 独立，双击输入框解锁后可改（不与骆驼共用） -->
        <div class="ui-field">
          <label class="ui-field__label">APK连接地址</label>
          <input
            v-model="serverUrl"
            class="ui-input"
            :class="{ 'is-unlocked': !urlLocked }"
            type="text"
            placeholder="APK连接地址"
            :readonly="urlLocked"
            :title="urlLocked ? '双击（触屏单击）可解锁修改' : '已解锁，可修改'"
            @dblclick="unlockUrl"
            @click="onUrlTap"
          />
          <small class="ui-help">提示：这是 MyTV 客户端独立的连接地址，与骆驼客户端互不影响。双击输入框解锁后可修改（触屏设备单击即可），解锁时自动填充当前后台地址；若内网访问，请手动填写外网地址。</small>
        </div>

        <div class="ui-field" style="margin-top: 6px">
          <label class="ui-field__label">更新内容</label>
          <textarea v-model="upBody" class="ui-textarea" rows="5" placeholder="请输入更新内容" />
          <small class="ui-help">提示：编译时随新版本一起保存，mytv 客户端检查更新时展示这段文字。</small>
        </div>

        <!-- ============ 编译基底（底包）============ -->
        <!-- 默认取镜像自带的那一份；上传的落持久卷 /config/mytv，重拉镜像不丢。
             三个元素排同一行：「检测更新」走远端 mytv-vX.Y.Z 发布序列，
             「手动上传」自选 APK，后面跟一条包名约束徽章。 -->
        <div class="ui-field" style="margin-top: 6px">
          <label class="ui-field__label">编译基底 APK</label>
          <div class="ui-inline base-meta">
            <span class="ui-kv">
              基底版本
              <span class="ui-badge ui-badge--info">{{ baseVersion || '-' }}</span>
            </span>
            <span class="ui-kv">
              包名
              <span class="ui-badge ui-badge--muted">{{ basePkg || '未探测到' }}</span>
            </span>
          </div>
          <div class="ui-inline base-actions">
            <button
              class="ui-btn ui-btn--primary"
              type="button"
              :disabled="checking || upgrading"
              @click="detectBaseUpdate"
            >
              {{ checking ? '检测中…' : upgrading ? '升级中…' : '检测更新' }}
            </button>
            <button
              class="ui-btn"
              type="button"
              :disabled="uploading"
              @click="pickBaseApk"
            >
              {{ uploading ? '上传中…' : '手动上传' }}
            </button>
            <span class="ui-badge ui-badge--muted">仅支持 .apk，且包名必须与上面一致</span>
          </div>

          <input
            ref="baseInput"
            class="base-file"
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            @change="onBaseApkUpload"
          />
        </div>

        <!-- ============ 版本：待发布 / 当前 ============ -->
        <!-- 与骆驼同一套两张卡：一张负责"出一版新的"，一张负责"现在线上是什么"。 -->
        <div class="ver-grid">
          <section class="ver-card">
            <header class="ver-card__head">新版本</header>
            <div class="ver-card__body">
              <div class="ui-kv">
                版本号
                <span class="ui-badge ui-badge--info">{{ newVersion || nextVersionFull || '-' }}</span>
              </div>
              <div class="ui-kv">
                大小
                <span class="ui-badge" :class="newSize ? 'ui-badge--success' : 'ui-badge--muted'">
                  {{ newSize || '未编译' }}
                </span>
              </div>
              <div class="ui-kv">
                MD5
                <span class="ui-badge ui-badge--muted ver-md5" :title="newMd5">{{ newMd5 || '-' }}</span>
              </div>
            </div>
            <footer class="ver-card__foot">
              <button class="ui-btn ui-btn--primary" type="button" :disabled="building" @click="buildApk">编译</button>
              <a class="ver-dl" :href="canUseNew ? newApkUrl : undefined" :download="newApkName">
                <button class="ui-btn" type="button" :disabled="!canUseNew">下载</button>
              </a>
              <button class="ui-btn ui-btn--danger" type="button" :disabled="!canUseNew" @click="publishApk">发布</button>
              <span v-if="building" class="ui-badge ui-badge--warning">编译中…</span>
            </footer>
          </section>

          <section class="ver-card">
            <header class="ver-card__head">当前版本</header>
            <div class="ver-card__body">
              <div class="ui-kv">
                版本号
                <span class="ui-badge ui-badge--info">{{ currentVersion || '-' }}</span>
              </div>
              <div class="ui-kv">
                大小
                <span class="ui-badge" :class="hasCurrent ? 'ui-badge--success' : 'ui-badge--muted'">
                  {{ hasCurrent ? curSize : '未编译' }}
                </span>
              </div>
              <div class="ui-kv">
                MD5
                <span class="ui-badge ui-badge--muted ver-md5" :title="curMd5">{{ curMd5 || '-' }}</span>
              </div>
            </div>
            <footer class="ver-card__foot">
              <a class="ver-dl" :href="hasCurrent ? apkUrl : undefined" :download="apkName">
                <button class="ui-btn" type="button" :disabled="!hasCurrent">下载</button>
              </a>
            </footer>
          </section>
        </div>
        <small class="ui-help">
          提示：「编译」在引擎里只产出待发布安装包，线上文件与版本号不动；点「发布」才把新包替换上去，
          下载页与 mytv 客户端自升级同时切到新版本。新版本号自动取当前版本末位 +1（三位补零）。
        </small>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* 解锁后的输入框：把"可修改"这件事画出来，否则与锁定态只差一个 readonly */
.is-unlocked {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent);
}

/* ---------- 编译基底（底包）---------- */
/* 基底版本与包名一行：.ui-kv 在行内要去掉自带的下外边距，否则文字比同一行
   的徽章高 5px（flex 按 margin box 居中，10px 下边距会把内容顶上去）。 */
.base-meta {
  margin-bottom: 8px;
}
.base-meta .ui-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}
.base-actions {
  align-items: center;
  flex-wrap: wrap;
}
/* 真正的 file input 藏起来，由「手动上传」按钮触发 click()。
   不用 display:none 而是用绝对定位，是因为部分浏览器对 display:none 的
   input 调 click() 不弹框；这里保持"可聚焦但不占位"。 */
.base-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* ---------- 版本卡片：新版本 / 当前版本（与骆驼 ClientPanel 同款） ---------- */
.ver-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.ver-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  overflow: hidden;
}
.ver-card__head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.ver-card__body { padding: 11px 12px 2px; }
/* 标签与徽章同一行：.ui-kv 默认是块级，这里改成 flex 让值紧跟标签 */
.ver-card__body .ui-kv {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ver-card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px 12px;
}
/* 校验值是 32 位定长串：放不下就省略，别把卡片撑宽；悬停看全量 */
.ver-md5 {
  font-family: var(--font-mono);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ver-dl { text-decoration: none; }
</style>
