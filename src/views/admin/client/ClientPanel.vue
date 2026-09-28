<script setup>
// 骆驼客户端设置 —— 重构自 admin_client.html（192 行）。
// 数据源：POST /api/client/data（一次给全线上包与待发布包的版本号/大小/MD5/下载地址）
// 动作端点（一个动作一条路由，请求体 JSON）：……
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitUpload } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { isCoarsePointer } from '@/utils/touchTap'
import { API, CLIENT_ROUTES as A } from '@/api/endpoints'
import AppSwitch from '@/components/AppSwitch.vue'

const d = ref(null)
const loading = ref(true)

/* ---- 编译配置 ---- */
const serverUrl = ref('')
const urlLocked = ref(true)
/* 只剩应用名与「新版本号」：包名写死在服务端，更新内容固定为 update */
const form = ref({
  appName: '',
  version: '',
})

/* ---- 两张卡片的数据：线上包 / 待发布包，各四件（版本号、大小、MD5、下载地址）---- */
const currentVersion = ref('')
const curSize = ref('')
const curMd5 = ref('')
const apkUrl = ref('')
const apkName = ref('')
const newSize = ref('')
const newMd5 = ref('')
const newExists = ref(false)
const newApkUrl = ref('')
const newApkName = ref('')

const iconUrl = ref('')
const bjList = ref([])          // [{ name, url }]
/** 右侧预览用哪张背景（点缩略图切换；留空时取第一张） */
const previewBjName = ref('')

/* ---- 应用默认设置 ---- */
const decoder = ref(0)
const buffTimeout = ref(5)
const needAuthor = ref(0)

/* ---- 应用提示 ---- */
const tips = ref({ loading: '', userExpired: '', userForbidden: '', userNoReg: '' })

const building = ref(false)
let pollTimer = null
const iconInput = ref(null)
const bjInput = ref(null)

const BUFF_OPTIONS = [5, 10, 15, 20, 25, 30]

/** 线上包是否已产出：GetFileSize 取不到时回的是 "0 MB" */
const hasCurrent = computed(() => Boolean(curSize.value) && curSize.value !== '0 MB')
// 待发布包现在能不能用。
// 编译中即便文件已经出现也不能用 —— 那一刻它还在被 apktool 写入，
// 下载下来是个半截包，md5 也还在变。所以"存在"之外还要 `!building`。
const canUseNew = computed(() => newExists.value && !building.value)

// 新版本号 = 当前版本末段数字 +1。
// "末段"取的是结尾那一串数字：1.0 → 1.1、1.9 → 1.10、1.0.0 → 1.0.1。
// 不能图省事写成"最后一个字符 +1" —— 那样 1.9 会算出 1:0 之类的怪串，……
function nextVersion(v) {
  const s = String(v ?? '').trim()
  const m = s.match(/(\d+)(\D*)$/)
  if (!m) return s ? `${s}.1` : '1.0'
  return s.slice(0, m.index) + String(Number(m[1]) + 1) + m[2]
}

/* ---- 右侧模拟电视：背景取"用户点选的那张"，没有就取第一张 ---- */
const previewBj = computed(() =>
  bjList.value.find((b) => b.name === previewBjName.value) || bjList.value[0] || null
)
/** 没上传图标时画的内置默认图标 —— 复制自 client/res/drawable-hdpi/icon.png */
const tvIconUrl = computed(() => iconUrl.value || '/static/images/icon.png')
const previewBjUrl = computed(() => previewBj.value?.url || '')
const tvScreenStyle = computed(() =>
  previewBjUrl.value ? { backgroundImage: `url(${previewBjUrl.value})` } : {}
)

async function load() {
  loading.value = true
  try {
    const g = (await post(API.adminClientData)) || {}
    d.value = g
    serverUrl.value = g.serverUrl || ''
    currentVersion.value = g.build?.version || ''
    form.value = {
      appName: g.build?.name || '',
      // 已有待发布的包就沿用它的版本号，否则默认「当前版本末位 +1」
      version: g.newVersion || nextVersion(g.build?.version),
    }
    curSize.value = g.upSize || ''
    curMd5.value = g.apkMd5 || ''
    newSize.value = g.newSize || ''
    newMd5.value = g.newMd5 || ''
    newExists.value = Boolean(g.newExists)
    apkUrl.value = g.apkUrl || ''
    apkName.value = g.apkName || ''
    newApkUrl.value = g.newApkUrl || ''
    newApkName.value = g.newApkName || ''
    iconUrl.value = g.iconUrl || ''
    bjList.value = (g.bjUrl || []).map((n) => ({ name: n, url: `/images/${n}.png` }))
    decoder.value = Number(g.app?.decoder ?? 0)
    buffTimeout.value = Number(g.app?.buffTimeout ?? 5)
    needAuthor.value = Number(g.app?.needAuthor ?? 0)
    tips.value = {
      loading: g.tips?.loading || '',
      userExpired: g.tips?.userExpired || '',
      userForbidden: g.tips?.userForbidden || '',
      userNoReg: g.tips?.userNoReg || '',
    }
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
   只在主指针是触摸时生效 —— 桌面上单击输入框要能正常聚焦/选字，
   顺手弹一个确认框是纯粹的干扰。 */
function onUrlTap() {
  if (urlLocked.value && isCoarsePointer()) unlockUrl()
}

/* ---------------- 图标上传 / 删除 ---------------- */
async function onIconPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const res = await submitUpload(API.adminClientUploadIcon, file, 'iconfile')
  if (res?.code === 1) iconUrl.value = res.data?.url || '/icon/icon.png'
  if (iconInput.value) iconInput.value.value = ''
}

async function removeIcon() {
  if (!(await confirm('确定删除应用图标吗？', { okText: '删除', okVariant: 'danger' }))) return
  const res = await submitAction(A.deleteIcon, {})
  if (res?.code === 1) iconUrl.value = ''
}

/* ---------------- 背景图上传 / 删除 ---------------- */
async function onBjPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const res = await submitUpload(API.adminClientUploadBj, file, 'bjfile')
  if (res?.code === 1 && res.data?.name) {
    bjList.value.push({ name: res.data.name, url: `/images/${res.data.name}.png` })
    // 新上传的立刻成为预览对象 —— 边传边看
    previewBjName.value = res.data.name
  }
  if (bjInput.value) bjInput.value.value = ''
}

async function removeBj(name) {
  if (!(await confirm('确定删除这张背景图吗？', { okText: '删除', okVariant: 'danger' }))) return
  const res = await submitAction(A.deleteBj, { name })
  if (res?.code === 1) {
    bjList.value = bjList.value.filter((b) => b.name !== name)
    if (previewBjName.value === name) previewBjName.value = ''
  }
}

/* ---------------- 编译：只产出「待发布」包，线上一个字节都不动 ---------------- */
async function buildApk() {
  if (!form.value.appName) { notify('应用名不能为空', 'warning'); return }
  if (!form.value.version) { notify('新版本号不能为空', 'warning'); return }
  if (String(form.value.version) === String(currentVersion.value)) {
    notify('新版本号不能与当前版本相同', 'warning'); return
  }
  const res = await submitAction(A.appInfo, {
    serverUrl: serverUrl.value,
    appName: form.value.appName,
    version: form.value.version,
    // 改造前这里要补一个 up_sets=0（语义「不勾选更新提示」），
    // 现在是明确的布尔字段
    upSet: false,
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
    `确定把 ${form.value.version} 发布上线吗？发布后当前版本与所有下载链接都会换成这个包。`,
    { okText: '发布', okVariant: 'danger' }
  )
  if (!ok) return
  // reload：版本号、大小、MD5、下载地址全变了，直接按服务端的事实重画两张卡片
  await submitAction(A.publish, {}, { reload: load })
}

/** 1s 轮询编译状态 —— 对齐旧版 getBuildStatus()，两张卡片同源刷新 */
function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await post(API.adminClientBuildStatus)
      applyBuildStatus(res?.data)
      if (res?.code === 1) {
        notify(res.msg || 'APK编译完成', 'success', 1500)
        building.value = false
        stopPolling()
      }
    } catch {
      notify('请求失败，稍后重试...', 'danger', 1200)
    }
  }, 1000)
}

// 用 buildStatus 的 data 刷新两张卡片。
// 编译中也要刷：体积在涨、md5 随写入变化，"编到哪了"就体现在这两个数上。
// 完成后同一次调用就把最终值定格，不必再取一次 client/data。
function applyBuildStatus(d) {
  if (!d) return
  if (d.version !== undefined) currentVersion.value = d.version || ''
  if (d.size !== undefined) curSize.value = d.size || ''
  if (d.md5 !== undefined) curMd5.value = d.md5 || ''
  if (d.newVersion) form.value.version = d.newVersion
  if (d.newSize !== undefined) newSize.value = d.newSize || ''
  if (d.newMd5 !== undefined) newMd5.value = d.newMd5 || ''
  if (d.newExists !== undefined) newExists.value = Boolean(d.newExists)
  if (d.newUrl) newApkUrl.value = d.newUrl
  // 名字要和 newUrl 一起刷：下载链接的 :download 取的就是它。
  if (d.name) apkName.value = d.name
  if (d.newName) newApkName.value = d.newName
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
onBeforeUnmount(stopPolling)

/* ---------------- 默认设置（onchange 即提交）---------------- */
async function onDecoderChange() {
  await submitAction(A.decoder, { decoder: Number(decoder.value) || 0 })
}
async function onBuffChange() {
  await submitAction(A.buffTimeout, { buffTimeout: Number(buffTimeout.value) || 0 })
}
async function onNeedAuthorChange() {
  await submitAction(A.needAuthor, { needAuthor: Number(needAuthor.value) || 0 })
}

/* ---------------- 应用提示 ---------------- */
async function saveTips() {
  await submitAction(
    A.tipSet,
    {
      loading: tips.value.loading,
      userExpired: tips.value.userExpired,
      userForbidden: tips.value.userForbidden,
      userNoReg: tips.value.userNoReg,
    },
    { reload: load }
  )
}
</script>

<template>
  <div v-if="loading" class="ui-alert ui-alert--info">
    <span class="ui-spinner" />正在加载客户端配置…
  </div>

  <template v-else>
    <!-- ============ 编译配置 ============ -->
    <div class="ui-card">
      <div class="ui-card__header"><h4>编译配置</h4></div>
      <div class="ui-card__body tv-split">
        <div class="tv-split__form">
          <!-- APK 连接地址：双击输入框解锁后可改 -->
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
            <small class="ui-help">提示：双击输入框解锁后可修改（触屏设备单击即可），解锁时自动填充当前后台地址；若内网访问，请手动填写外网地址。</small>
          </div>

          <!-- 应用名 / 图标 / 背景同一行：这三件都是"客户端长什么样"，
               挤成上下两行只让表单更长，不增加信息 -->
          <div class="ui-inline" style="margin-top: 6px; align-items: flex-start">
            <div class="ui-field" style="flex: 1; min-width: 150px">
              <label class="ui-field__label">应用名</label>
              <input v-model="form.appName" class="ui-input" type="text" placeholder="应用名" />
            </div>
            <div class="ui-field" style="flex: none">
              <label class="ui-field__label">应用图标</label>
              <div class="ui-inline" style="gap: 6px">
                <label class="ui-btn ui-btn--primary" style="margin: 0">
                  更改图标
                  <input ref="iconInput" type="file" accept="image/png" style="display: none" @change="onIconPick" />
                </label>
                <div v-if="iconUrl" class="thumb">
                  <img :src="iconUrl" alt="预览" />
                  <span class="thumb__del" title="删除" @click="removeIcon">&times;</span>
                </div>
              </div>
            </div>
            <div class="ui-field" style="flex: 2; min-width: 260px">
              <label class="ui-field__label">背景图片</label>
              <div class="ui-inline" style="gap: 6px">
                <label class="ui-btn ui-btn--primary" style="margin: 0">
                  上传背景
                  <input ref="bjInput" type="file" accept="image/png" style="display: none" @change="onBjPick" />
                </label>
                <div
                  v-for="b in bjList"
                  :key="b.name"
                  class="thumb"
                  :class="{ 'is-active': previewBj?.name === b.name }"
                  :title="b.name"
                  @click="previewBjName = b.name"
                >
                  <img :src="b.url" alt="预览" />
                  <span class="thumb__del" title="删除" @click.stop="removeBj(b.name)">&times;</span>
                </div>
              </div>
            </div>
          </div>
          <small class="ui-help">
            提示：图片仅支持PNG格式，不超过800KB；多张背景图在客户端随机显示，点缩略图可切换右侧预览。
          </small>

          <!-- ============ 版本：待发布 / 当前 ============ -->
          <!-- 一张卡片负责"出一版新的"，一张负责"现在线上是什么"。 -->
          <!-- 两张都按 版本号 / 大小 / MD5 三行展示，值用徽章 —— 与「引擎状态」…… -->
          <div class="ver-grid">
            <section class="ver-card">
              <header class="ver-card__head">新版本</header>
              <div class="ver-card__body">
                <div class="ui-kv">
                  版本号
                  <span class="ui-badge ui-badge--info">{{ form.version || '-' }}</span>
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
            提示：「编译」只产出待发布安装包，线上文件与版本号不动；点「发布」才把新包替换上去，
            下载页与客户端自升级同时切到新版本。
          </small>
        </div>

        <!-- ============ 模拟智能电视：实时预览应用名 / 图标 / 背景 ============ -->
        <aside class="tv-split__preview">
          <div class="tv">
            <div class="tv__screen" :style="tvScreenStyle">
              <div class="tv__launcher">
                <div class="tv__icon">
                  <img :src="tvIconUrl" alt="" />
                </div>
                <div class="tv__name">{{ form.appName || '应用名称' }}</div>
              </div>
            </div>
            <div class="tv__stand" />
          </div>
          <div class="tv__hint">
            模拟智能电视预览 · 背景 {{ bjList.length }} 张随机显示<span v-if="bjList.length > 1">（点缩略图切换预览）</span>
          </div>
        </aside>
      </div>
    </div>

    <!-- ============ 应用默认设置 ============ -->
    <div class="ui-card">
      <div class="ui-card__header"><h4>应用默认设置</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <div class="ui-field" style="flex: none">
            <label class="ui-field__label">解码模式</label>
            <select v-model.number="decoder" class="ui-select" style="width: 150px" @change="onDecoderChange">
              <option :value="0">自动选择</option>
              <option :value="1">硬件解码</option>
              <option :value="2">软件解码</option>
            </select>
          </div>

          <div class="ui-field" style="flex: none">
            <label class="ui-field__label">超时跳转时长</label>
            <select v-model.number="buffTimeout" class="ui-select" style="width: 130px" @change="onBuffChange">
              <option v-for="s in BUFF_OPTIONS" :key="s" :value="s">{{ s }} 秒</option>
            </select>
          </div>

          <div class="ui-field" style="flex: none">
            <label class="ui-field__label">客户端授权</label>
            <AppSwitch v-model="needAuthor" @change="onNeedAuthorChange" />
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 应用提示 ============ -->
    <div class="ui-card">
      <div class="ui-card__header"><h4>应用提示</h4></div>
      <div class="ui-card__body">
        <div class="ui-field">
          <label class="ui-field__label">节目加载提示</label>
          <input v-model="tips.loading" class="ui-input" type="text" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">授权到期提示</label>
          <input v-model="tips.userExpired" class="ui-input" type="text" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">账号停用提示</label>
          <input v-model="tips.userForbidden" class="ui-input" type="text" />
        </div>
        <div class="ui-field">
          <label class="ui-field__label">未予授权提示</label>
          <input v-model="tips.userNoReg" class="ui-input" type="text" />
        </div>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveTips">保存</button>
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
.thumb {
  position: relative;
  display: inline-flex;
  flex: none;
}
.thumb img {
  height: 38px;
  border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: block;
}
.thumb__del {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  line-height: 15px;
  text-align: center;
  border-radius: 50%;
  background: var(--c-danger);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
/* 当前被右侧预览选中的那张背景 */
.thumb.is-active img {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--c-primary) 30%, transparent);
}

/* ---------- 版本卡片：新版本 / 当前版本 ---------- */
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

/* ---------- 右侧：模拟智能电视 ---------- */
.tv-split {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 22px;
}
.tv-split__form { flex: 1 1 520px; min-width: 320px; }
.tv-split__preview {
  flex: 0 0 auto;
  width: 336px;
  position: sticky;
  top: 12px;
}
.tv {
  padding: 10px 10px 14px;
  border-radius: 12px;
  background: #1c1f24;
}
.tv__screen {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  /* 没设背景图时的默认底色 —— 与 APK 里"未配置背景"时的呈现一致；
     上传后由内联 background-image 盖住这层纯色。 */
  background-color: #449fe9;
  background-size: cover;
  background-position: center;
}
/* 压在背景图上的暗角：不管底图明暗，图标与名称都读得清 */
.tv__screen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 50% 42%, rgb(0 0 0 / 12%), rgb(0 0 0 / 62%));
}
.tv__launcher {
  position: relative;
  z-index: 1;
  max-width: 78%;
  text-align: center;
}
.tv__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  margin: 0 auto 10px;
  border-radius: 14px;
  overflow: hidden;
  background: rgb(255 255 255 / 12%);
  box-shadow: 0 6px 16px rgb(0 0 0 / 45%);
}
.tv__icon img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tv__name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: .02em;
  color: #fff;
  word-break: break-all;
  text-shadow: 0 2px 6px rgb(0 0 0 / 60%);
}
.tv__stand {
  width: 74px;
  height: 6px;
  margin: 8px auto 0;
  border-radius: 0 0 4px 4px;
  background: #2b2f36;
}
.tv__hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--c-text-3);
  text-align: center;
}
</style>
