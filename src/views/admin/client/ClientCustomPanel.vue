<script setup>
// 定制APK（定制授权专属）—— 与 MyTV 客户端同一套「编译 → 待发布 → 发布」三段，
// 差异是刻意做减法（用户要求）：
//   1. 取消「默认基底 APK」：基底只有用户上传的那一份 /config/custom，没有镜像出厂兜底；
//   2. 取消「在线升级」：没有检测更新 / 在线升级基底这条链路；
//   3. 取消「包名检查」：上传基底不校验包名（定制包本身就是改过包名/应用名的）。
// 连接地址与 mytv **共用**（只读展示，改地址去 MyTV 标签页），
// 版本号与更新说明、"编译→发布"的语义与 mytv 完全一致。
// 数据源：POST /api/clientCustom/data（形状与 clientMyTV/data 对齐，一个 apply 函数复用）
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitUpload } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API, CUSTOM_ROUTES } from '@/api/endpoints'

/* ---- 编译配置 ---- */
const clientName = ref('')
const serverUrl = ref('')
const upBody = ref('')

/* ---- 编译基底（底包）---- */
const baseVersion = ref('')
const uploading = ref(false)
const baseInput = ref(null)

/* ---- 两张卡片的数据：线上包 / 待发布包 ---- */
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

const loading = ref(true)
const building = ref(false)
let pollTimer = null

/** 线上包是否已产出：GetFileSize 取不到时回的是 "0 MB" */
const hasCurrent = computed(() => Boolean(curSize.value) && curSize.value !== '0 MB')
// 编译中即便文件已经出现也不能用 —— 那一刻它还在被 apktool 写入。
const canUseNew = computed(() => newExists.value && !building.value)

// 新版本的编译号 = 当前版本末段数字 +1（与 mytv 同一条规则）。
// 必须补足三位：底包 versionName 末段就是三位，编译时是二进制 manifest 里的
// 定长字节替换，长短不一就把 manifest 写坏；另外客户端按字符串比版本。
function pad3(n) {
  return String(n).padStart(3, '0')
}
function nextBuildNo(v) {
  const m = String(v ?? '').match(/(\d+)$/)
  const n = m ? Number(m[1]) + 1 : 1
  return pad3(Math.min(n, 999))
}
const nextVersionFull = computed(() => {
  const base = String(baseVersion.value || '')
  if (!base) return ''
  return `${base}.${nextBuildNo(currentVersion.value)}`
})

async function load() {
  loading.value = true
  try {
    const g = (await post(API.adminClientCustomData)) || {}
    clientName.value = g.name || ''
    serverUrl.value = g.serverUrl || ''
    upBody.value = g.update || ''
    baseVersion.value = g.baseVersion || ''
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

/* ---------------- 编译基底：上传替换底包（**不检查包名**） ----------------
   底包落 /config/custom（持久卷）。与 mytv 那条的区别：没有出厂兜底、没有在线升级，
   也不校验包名 —— 定制包本身就是改过包名的包。唯一的约束是版本号要能提出来
   （"基底版本.编译号"这套版本号规则依赖它），由引擎负责校验。 */
function pickBaseApk() {
  if (uploading.value) return
  baseInput.value?.click()
}

async function onBaseApkUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    // 基底换了 ⇒ 基底版本、待发布包状态全变，按服务端事实重画整个面板
    await submitUpload(API.adminClientCustomUploadBase, file, 'apkfile', { reload: load })
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

/* ---------------- 编译：只产出「待发布」包，线上一个字节都不动 ---------------- */
async function buildApk() {
  if (!clientName.value.trim()) { notify('客户端名称不能为空', 'warning'); return }
  const res = await submitAction(CUSTOM_ROUTES.save, {
    name: clientName.value.trim(),
    appVersion: nextBuildNo(currentVersion.value),
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
  await submitAction(CUSTOM_ROUTES.publish, {}, { reload: load })
}

/** 1s 轮询编译状态 —— 与 mytv 同一套：两张卡片同源刷新 */
function startPolling() {
  stopPolling()
  let requesting = false
  pollTimer = setInterval(async () => {
    if (requesting) return
    requesting = true
    try {
      const res = await post(API.adminClientCustomBuildStatus)
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

function applyBuildStatus(d) {
  if (!d) return
  if (d.name !== undefined) clientName.value = d.name || ''
  if (d.serverUrl !== undefined) serverUrl.value = d.serverUrl || ''
  if (d.update !== undefined) upBody.value = d.update || ''
  if (d.baseVersion !== undefined) baseVersion.value = d.baseVersion || ''
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
    <span class="ui-spinner" />正在加载定制客户端配置…
  </div>

  <template v-else>
    <div class="ui-card">
      <div class="ui-card__header"><h4>定制客户端编译配置</h4></div>
      <div class="ui-card__body">
        <div class="ui-field">
          <label class="ui-field__label">客户端名称</label>
          <input v-model="clientName" class="ui-input" type="text" placeholder="定制客户端" />
          <small class="ui-help">
            提示：这个名字同时是 APK 文件名主体与下载页里的 {CUSTOM_NAME}（不含版本号与类型后缀）。
          </small>
        </div>

        <!-- 连接地址与 mytv 共用：这里只读展示，避免两处地址各改一半 -->
        <div class="ui-field" style="margin-top: 6px">
          <label class="ui-field__label">APK连接地址</label>
          <input
            :value="serverUrl"
            class="ui-input"
            type="text"
            placeholder="（未配置）"
            readonly
            title="定制客户端与 MyTV 共用同一个连接地址"
          />
          <small class="ui-help">
            提示：与 MyTV 客户端**共用**同一个连接地址，在这里不可修改 —— 要改请到「MyTV客户端」标签页。
          </small>
        </div>

        <div class="ui-field" style="margin-top: 6px">
          <label class="ui-field__label">更新内容</label>
          <textarea v-model="upBody" class="ui-textarea" rows="5" placeholder="请输入更新内容" />
          <small class="ui-help">提示：编译时随新版本一起保存，定制客户端检查更新时展示这段文字。</small>
        </div>

        <!-- ============ 编译基底（底包）============ -->
        <!-- 只有用户上传的这一份：没有镜像出厂兜底，也没有在线升级。 -->
        <div class="ui-field" style="margin-top: 6px">
          <label class="ui-field__label">编译基底 APK</label>
          <div class="ui-inline base-meta">
            <span class="ui-kv">
              基底版本
              <span class="ui-badge ui-badge--info">{{ baseVersion || '-' }}</span>
            </span>
          </div>
          <div class="ui-inline base-actions">
            <button class="ui-btn ui-btn--primary" type="button" :disabled="uploading" @click="pickBaseApk">
              {{ uploading ? '上传中…' : '上传基底' }}
            </button>
            <span class="ui-badge ui-badge--muted">仅支持 .apk，不校验包名</span>
          </div>
          <small class="ui-help">
            提示：定制客户端基于 MyTV 改了包名与应用名，所以这里**不检查包名**；
            但版本号仍需形如 1.2.2.001（末段至少三位数字），否则版本号规则就不成立。
          </small>

          <input
            ref="baseInput"
            class="base-file"
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            @change="onBaseApkUpload"
          />
        </div>

        <!-- ============ 版本：待发布 / 当前 ============ -->
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
          提示：「编译」在引擎里只产出待发布安装包，线上文件与版本号不动；点「发布」才把新包替换上去。
          新版本号自动取当前版本末位 +1（三位补零）。
        </small>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* 基底那一行：版本徽章与说明对齐（.ui-kv 在行内要去掉自带下外边距）。 */
.base-meta {
  margin-bottom: 8px;
}
.base-meta .ui-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}

/* ---------- 版本卡片：新版本 / 当前版本（与 MyTV 面板同款） ----------
   .ver-* 是这两个面板共用的类名，但 <style scoped> 不跨组件生效 ——
   少了这一段，「新版本 / 当前版本」两张卡片就会没有边框与栅格，
   退化成整行堆叠的裸文字（看着就是"渲染失败"）。改这里请与
   ClientMyTVPanel.vue 的 .ver-* 保持同步。 */
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
