<script setup>
// 进阶功能 —— 重构自 admin_license.html（426 行）。
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { post } from '@/api/http'
import { submitAction } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API, ENGINE_ROUTES } from '@/api/endpoints'
import AppSwitch from '@/components/AppSwitch.vue'
import AppModal from '@/components/AppModal.vue'

// ⚠️ 这行 console.log 是**故意保留**的原版行为，别当调试残留清掉：
console.log('入群密码后半段： 599f2b69')

const d = ref(null)
const loading = ref(true)

/* ---- 表单态（初始化后从接口回填）---- */
const proxy = ref(0)
const autoRes = ref(0)
const disCh = ref(0)
const epgFuzz = ref(0)
const shortURL = ref(0)

/* ---- 模态框 ---- */
const showRegister = ref(false)
const showLogin = ref(false)
const showReset = ref(false)
const showChangePwd = ref(false)
const showLog = ref(false)

const registerForm = ref({ name: '', pwd: '', pwd2: '' })
const loginForm = ref({ name: '', pwd: '' })
const resetForm = ref({ name: '' })
const pwdForm = ref({ opwd: '', pwd: '', pwd2: '' })
const licLog = ref('')

/* ---- 派生状态 ---- */
const lic = computed(() => d.value?.lic || {})
const licType = computed(() => Number(lic.value.type ?? 0))
const logged = computed(() => Number(lic.value.status ?? 0) === 1)

// 引擎给的**具体原因**优先（"网络连接失败" / "机器码不匹配" …）。
const licMsg = computed(() => String(lic.value.msg || '').trim())

const typeText = computed(() => {
  if (licMsg.value) return licMsg.value
  switch (licType.value) {
    case 0: return '未授权'
    case 1: return '已授权'
    case 2: return '永久授权'
    default: return '定制授权'
  }
})
// 有具体原因时用 warning（黄）：它不是"未授权"那种 red 终态，网络恢复会自愈。
const typeVariant = computed(() => {
  if (licMsg.value) return 'warning'
  return licType.value === 0 ? 'danger' : 'success'
})
const expText = computed(() => (licType.value > 1 ? '永久授权' : lic.value.exp_str || '-'))

// 授权是否**当前可用** —— 四张功能卡的开关是否可点的唯一判据。
const licensed = computed(() => {
  if (licType.value >= 2) return true
  if (licType.value < 1) return false
  const exp = Number(lic.value.exp ?? 0)
  if (!exp) return false
  return exp > Math.floor(Date.now() / 1000)
})

// 开关不可用的原因文案（挂在卡片的 title 上，鼠标悬停能说清为什么点不动）。
const licHint = computed(() => {
  if (licensed.value) return ''
  if (licMsg.value) return licMsg.value
  return licType.value === 0 ? '未授权，请先登录授权账号' : '授权已过期，请重新登录授权账号'
})

// 四张功能卡恒渲染 —— 它们是功能介绍，藏起来用户就不知道授权能得到什么。

async function load() {
  loading.value = true
  try {
    d.value = await post(API.adminEngineData)
    const g = d.value || {}
    proxy.value = Number(g.proxy ?? 0)
    autoRes.value = Number(g.autoRes ?? 0)
    disCh.value = Number(g.disCh ?? 0)
    epgFuzz.value = Number(g.epgFuzz ?? 0)
    shortURL.value = Number(g.shortUrl ?? 0)
    syncSiteLic(g.lic)
  } catch { /* http.js 已处理 */ } finally {
    loading.value = false
  }
}

// 把本页拿到的授权态回写到全局 `isLic`（utils/site.js）。
function syncSiteLic(rawLic) {
  if (!rawLic || typeof rawLic !== 'object') return
  const type = Number(rawLic.type ?? 0)
  const exp = Number(rawLic.exp ?? 0)
  const ok = type >= 2 || (type >= 1 && exp > Math.floor(Date.now() / 1000))
  if (isLic.value !== ok) isLic.value = ok
}

// 仅在停留本页期间，每 5s 取一次最新状态（需求原话：「仅打开进阶功能时
const stateTimer = ref(null)

function startStatePolling() {
  stopStatePolling()
  stateTimer.value = setInterval(async () => {
    try {
      const g = await post(API.adminEngineData)
      if (!g || typeof g !== 'object') return
      d.value = g
      proxy.value = Number(g.proxy ?? 0)
      autoRes.value = Number(g.autoRes ?? 0)
      disCh.value = Number(g.disCh ?? 0)
      epgFuzz.value = Number(g.epgFuzz ?? 0)
      shortURL.value = Number(g.shortUrl ?? 0)
      syncSiteLic(g.lic)
    } catch { /* 静默：下一拍自己会回来 */ }
  }, 5000)
}

function stopStatePolling() {
  if (stateTimer.value) {
    clearInterval(stateTimer.value)
    stateTimer.value = null
  }
}

onMounted(async () => {
  await load()
  startStatePolling()
})

onBeforeUnmount(stopStatePolling)

// code=5 在旧版语义是「刷新页面生效」。
async function postEngine(url, body = {}, opts = {}) {
  const res = await submitAction(url, body, { ...opts, reload: undefined })
  if (res && res.code === 5) {
    notify(res.msg || '刷新页面生效', res.type || 'success')
    setTimeout(() => window.location.reload(), 600)
    return res
  }
  if (res && res.code >= 1 && typeof opts.reload === 'function') await opts.reload()
  return res
}

// 功能开关
async function toggleEngine(url, body, revert, successMsg) {
  // 兜底拦截：开关已被 disabled，正常点不到这里。但**键盘/脚本仍可能触发
  if (!licensed.value) {
    if (typeof revert === 'function') revert()
    notify(licHint.value || '未授权，请先登录授权账号', 'warning', 3000)
    return null
  }

  const res = await submitAction(url, body, { silent: true })
  if (res && res.code === 5) {
    notify(res.msg || '设置成功，刷新页面生效', res.type || 'success')
    setTimeout(() => window.location.reload(), 600)
    return res
  }
  if (res && res.code >= 1) {
    notify(successMsg || res.msg || '设置成功', 'success', 2000)
  } else {
    if (typeof revert === 'function') revert()
    notify(res?.msg || '设置失败，已恢复原状态', 'danger', 3200)
  }
  return res
}

/** 开关回滚：把对应的 ref 改回"切换前"的值（开关量只有 0/1 两态） */
const revertTo = (r, v) => () => { r.value = v === 1 ? 0 : 1 }

// 中转访问
async function onToggleProxy(v) {
  await toggleEngine(ENGINE_ROUTES.proxy, { enable: v === 1 }, revertTo(proxy, v), v === 1 ? '已开启中转' : '已关闭中转')
}

async function onToggleAutoRes(v) {
  await toggleEngine(ENGINE_ROUTES.autoRes, { enable: v === 1 }, revertTo(autoRes, v), v === 1 ? '已开启自动识别' : '已关闭自动识别')
}
async function onToggleDisCh(v) {
  await toggleEngine(ENGINE_ROUTES.disCh, { enable: v === 1 }, revertTo(disCh, v), v === 1 ? '已开启自动禁用' : '已关闭自动禁用')
}
async function onToggleEpgFuzz(v) {
  await toggleEngine(ENGINE_ROUTES.epgFuzz, { enable: v === 1 }, revertTo(epgFuzz, v), v === 1 ? '已开启模糊识别' : '已关闭模糊识别')
}
async function onToggleShortURL(v) {
  await toggleEngine(ENGINE_ROUTES.shortURL, { enable: v === 1 }, revertTo(shortURL, v), v === 1 ? '已开启短订阅链接' : '已关闭短订阅链接')
}

/* ---------------- 引擎 ---------------- */
async function restartEngine() {
  if (!(await confirm('确定要重启引擎吗？', { okText: '重启', okVariant: 'danger' }))) return
  await postEngine(ENGINE_ROUTES.restartEngine, {}, { reload: load })
}

// 引擎日志（实时刷新）
const logTimer = ref(null)
const logBox = ref(null)
let logInFlight = false

/** 视口是否贴在底部 —— 贴在底部才跟着新日志往下走，用户翻历史时不许拽回去 */
function logAtBottom() {
  const el = logBox.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function scrollLogToBottom() {
  const el = logBox.value
  if (el) el.scrollTop = el.scrollHeight
}

async function fetchLog() {
  if (logInFlight) return
  logInFlight = true
  try {
    const text = await post(API.adminEngineLog)
    if (typeof text !== 'string') return
    // 先记下用户当前的滚动位置：赋新值会把 textarea 拽回顶部
    const follow = logAtBottom()
    if (text !== licLog.value) {
      licLog.value = text
      await nextTick()
      if (follow) scrollLogToBottom()
    }
  } catch {
    // 轮询期间的网络抖动不该刷红字（2s 一次，断了会刷屏）。
    // 只在**手动打开**那一次失败时提示 —— 见 openLog。
  } finally {
    logInFlight = false
  }
}

function stopLogPolling() {
  if (logTimer.value) {
    clearInterval(logTimer.value)
    logTimer.value = null
  }
}

async function openLog() {
  showLog.value = true
  licLog.value = ''
  try {
    const text = await post(API.adminEngineLog)
    licLog.value = typeof text === 'string' ? text : ''
    // 先成功拿到一次再起轮询：接口都不通时不必每 2s 撞一次墙。
    stopLogPolling()
    logTimer.value = setInterval(fetchLog, 2000)
    await nextTick()
    scrollLogToBottom()
  } catch (e) {
    // 登录失效时 http.js 已经跳登录页了，不该再叠一条"读取失败"
    if (e?.message !== '登录已失效') notify('日志读取失败', 'danger')
  }
}

/* 弹窗关闭 → 停轮询。放在 watch 而不是"关闭按钮的 @click"上：遮罩点击、
   Esc 关闭同样会走到这里，挂在按钮上会漏掉那两条路径。 */
watch(showLog, (open) => {
  if (!open) stopLogPolling()
})

// 离开本页（切菜单 / 关标签）时兜底清理：SPA 内部导航会卸载本组件，
// onBeforeUnmount 能收到；真正的关标签页由浏览器自己回收。
onBeforeUnmount(stopLogPolling)

async function checkProxy() {
  try {
    // ⚠️ 同样是 POST（管理端没有 GET 路由）—— 用裸 fetch 打过去会拿到
    //    {"code":0,"msg":"接口不存在"}，点一次报一次"访问异常"，看着像中转挂了。
    const val = await post(API.adminEngineCheckProxy)
    // 后端回的是 JSON 字符串化的中转 /status 原文，健康时**恰好**是 "ok"
    // （引擎侧判据同款：service/adminEngineService.go 的 `got != "ok"`）
    if (String(val ?? '').trim() === 'ok') notify('中转服务访问正常', 'success', 1200)
    else notify('中转服务访问异常,请检查配置', 'danger', 3000)
  } catch (e) {
    if (e?.message !== '登录已失效') notify('中转服务访问异常,请检查配置', 'danger', 3000)
  }
}

/* ---------------- 授权账号 ---------------- */
async function doRegister() {
  const f = registerForm.value
  if (!f.name || !f.pwd) { notify('用户名或密码不能为空', 'warning'); return }
  if (f.pwd !== f.pwd2) { notify('两次输入的密码不一致', 'danger'); return }
  const res = await postEngine(ENGINE_ROUTES.register, { name: f.name, pwd: f.pwd, pwd2: f.pwd2 })
  if (res?.code >= 1) { showRegister.value = false; registerForm.value = { name: '', pwd: '', pwd2: '' } }
}

async function doLogin() {
  const f = loginForm.value
  if (!f.name || !f.pwd) { notify('用户名或密码不能为空', 'warning'); return }
  const res = await postEngine(ENGINE_ROUTES.login, { name: f.name, pwd: f.pwd })
  if (res?.code === 5 || res?.code >= 1) {
    showLogin.value = false
    loginForm.value = { name: '', pwd: '' }
  }
}

async function doReset() {
  const f = resetForm.value
  if (!f.name) { notify('用户名不能为空', 'warning'); return }
  const res = await postEngine(ENGINE_ROUTES.reset, { name: f.name })
  if (res?.code >= 1) { showReset.value = false; resetForm.value = { name: '' } }
}

async function doChangePwd() {
  const f = pwdForm.value
  if (!f.opwd || !f.pwd || !f.pwd2) { notify('不能为空', 'warning'); return }
  if (f.pwd !== f.pwd2) { notify('两次输入的密码不一致', 'danger'); return }
  await postEngine(ENGINE_ROUTES.changePwd, { oldPwd: f.opwd, pwd: f.pwd, pwd2: f.pwd2 })
}

async function doLogout() {
  if (!(await confirm('确定要退出当前授权账号吗？', { okText: '退出', okVariant: 'danger' }))) return
  await postEngine(ENGINE_ROUTES.logout, {})
}
</script>

<template>
  <div v-if="loading" class="ui-alert ui-alert--info">
    <span class="ui-spinner" />正在加载授权信息…
  </div>

  <template v-else>
    <!-- ============ 第一行：授权信息 / 引擎状态 ============ -->
    <div class="ui-grid ui-grid--2">
      <!-- 授权信息 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>授权信息</h4>
          <!-- 已登录：账号 + 密码修改 + 退出 -->
          <div v-if="logged" class="ui-inline" style="gap: 6px">
            <span class="ui-badge ui-badge--info">{{ lic.name }}</span>
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="showChangePwd = true">密码修改</button>
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="doLogout">退出</button>
          </div>
          <!-- 未登录：注册 + 登录 + 密码重置 -->
          <div v-else class="ui-inline" style="gap: 6px">
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="showRegister = true">注册</button>
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="showLogin = true">登录</button>
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="showReset = true">密码重置</button>
          </div>
        </div>
        <div class="ui-card__body">
          <p class="ui-kv">机器码：<span class="ui-kv__v">{{ lic.id || '-' }}</span></p>
          <p class="ui-kv">
            授权状态：<span class="ui-badge" :class="`ui-badge--${typeVariant}`">{{ typeText }}</span>
          </p>
          <p class="ui-kv">过期时间：<span class="ui-kv__v">{{ expText }}</span></p>
        </div>
      </div>

      <!-- 引擎状态 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>
            引擎状态
            <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="openLog">查看日志</button>
          </h4>
          <button class="ui-btn ui-btn--info" type="button" @click="restartEngine">重启引擎</button>
        </div>
        <div class="ui-card__body">
          <p class="ui-kv">
            引擎状态：<span class="ui-badge" :class="d.status === 1 ? 'ui-badge--success' : 'ui-badge--danger'">
              {{ d.status === 1 ? '运行中' : '已下线' }}
            </span>
          </p>
          <p class="ui-kv">
            连接状态：<span class="ui-badge" :class="d.online === 1 ? 'ui-badge--success' : 'ui-badge--danger'">
              {{ d.online === 1 ? '已连接' : '已下线' }}
            </span>
          </p>
          <p class="ui-kv">
            引擎版本：<span class="ui-kv__v">{{ d.version || '-' }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- ============ 功能开关 ============ -->
    <!-- 四张卡**恒渲染**，与授权状态无关（见文件头"本轮改动"）。 -->
    <!-- 「未授权」不再表现为"这里空着"，而是登录后台时的一次性提示弹窗…… -->
    <div class="ui-section">
      <span class="ui-section__title">功能开关</span>
      <span class="ui-section__desc">开关即时生效</span>
    </div>

    <div class="ui-grid ui-grid--2">
      <!-- 中转访问 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>中转访问</h4>
          <span v-if="!licensed" class="ui-badge ui-badge--danger">未授权</span>
        </div>
        <div class="ui-card__body">
          <div class="ui-inline" style="align-items: center">
            <span class="ui-field__label" style="margin: 0">开启中转:</span>
            <AppSwitch v-model="proxy" :disabled="!licensed" @change="onToggleProxy" />
            <button
              v-if="proxy === 1"
              class="ui-btn ui-btn--info ui-btn--xs"
              type="button"
              style="margin-left: 10px"
              @click="checkProxy"
            >
              可用性检测
            </button>
          </div>
          <small class="ui-help ui-help--ink">
            由引擎实现的单播转组播。开启中转后会自动启用频道聚合：通过编写正则表达式或者勾选EPG，将不同分组的频道聚合到新分组内（需要频道已经绑定了EPG），举例来说，聚合分组可以将不同订阅源中的CCTV1、CCTV2等收集到一起。关闭中转时聚合分组功能一并关闭。
          </small>
        </div>
      </div>

      <!-- 分辨率 && 延迟测试 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>分辨率&amp;&amp;延迟测试</h4>
          <span v-if="!licensed" class="ui-badge ui-badge--danger">未授权</span>
        </div>
        <div class="ui-card__body">
          <div class="ui-inline" style="margin-bottom: 12px">
            <span class="ui-field__label" style="margin: 0">自动识别:</span>
            <AppSwitch v-model="autoRes" :disabled="!licensed" @change="onToggleAutoRes" />
          </div>
          <small class="ui-help ui-help--ink">提示：源更新时自动测试分辨率和延迟，CPU、内存占用较大，谨慎开启！！！可以在「频道管理 → 频道分组 → EPG管理」里手动单条测速、测分辨率。</small>

          <div class="ui-inline" style="margin-top: 14px; margin-bottom: 12px">
            <span class="ui-field__label" style="margin: 0">自动禁用:</span>
            <AppSwitch v-model="disCh" :disabled="!licensed" @change="onToggleDisCh" />
          </div>
          <small class="ui-help ui-help--ink">提示：无法识别分辨率时或访问失败自动禁用频道，若源有UA或其他要求，请谨慎开启。</small>
        </div>
      </div>

      <!-- EPG 模糊识别 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>EPG模糊识别</h4>
          <span v-if="!licensed" class="ui-badge ui-badge--danger">未授权</span>
        </div>
        <div class="ui-card__body">
          <div class="ui-inline" style="margin-bottom: 12px">
            <span class="ui-field__label" style="margin: 0">EPG模糊识别:</span>
            <AppSwitch v-model="epgFuzz" :disabled="!licensed" @change="onToggleEpgFuzz" />
          </div>
          <small class="ui-help ui-help--ink">提示：频道自动绑定未识别时启用模糊识别，以提升识别成功率。存在识别错误问题，谨慎开启。</small>
        </div>
      </div>

      <!-- 短订阅链接 -->
      <div class="ui-card">
        <div class="ui-card__header">
          <h4>短订阅链接</h4>
          <span v-if="!licensed" class="ui-badge ui-badge--danger">未授权</span>
        </div>
        <div class="ui-card__body">
          <div class="ui-inline" style="margin-bottom: 12px">
            <span class="ui-field__label" style="margin: 0">短订阅链接开关:</span>
            <AppSwitch v-model="shortURL" :disabled="!licensed" @change="onToggleShortURL" />
          </div>
          <small class="ui-help ui-help--ink">更短的订阅链接，方便电视遥控器输入。相对更容易泄露，外网使用谨慎开启。</small>
        </div>
      </div>
    </div>

    <!-- ============ 模态框 ============ -->
    <AppModal v-model="showRegister" title="注册">
      <div class="ui-field">
        <label class="ui-field__label">邮箱</label>
        <input v-model="registerForm.name" class="ui-input" type="text" placeholder="请输入邮箱" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">密码</label>
        <input v-model="registerForm.pwd" class="ui-input" type="password" placeholder="请输入密码" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">确认密码</label>
        <input v-model="registerForm.pwd2" class="ui-input" type="password" placeholder="确认密码" @keyup.enter="doRegister" />
      </div>
      <template #footer>
        <button class="ui-btn" type="button" @click="showRegister = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doRegister">确定</button>
      </template>
    </AppModal>

    <AppModal v-model="showLogin" title="登录">
      <div class="ui-field">
        <label class="ui-field__label">邮箱</label>
        <input v-model="loginForm.name" class="ui-input" type="text" placeholder="请输入邮箱" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">密码</label>
        <input v-model="loginForm.pwd" class="ui-input" type="password" placeholder="请输入密码" @keyup.enter="doLogin" />
      </div>
      <template #footer>
        <button class="ui-btn" type="button" @click="showLogin = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doLogin">确定</button>
      </template>
    </AppModal>

    <AppModal v-model="showReset" title="密码重置">
      <div class="ui-field">
        <label class="ui-field__label">邮箱</label>
        <input v-model="resetForm.name" class="ui-input" type="text" placeholder="请输入邮箱" @keyup.enter="doReset" />
      </div>
      <template #footer>
        <button class="ui-btn" type="button" @click="showReset = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doReset">确定</button>
      </template>
    </AppModal>

    <AppModal v-model="showChangePwd" title="密码修改">
      <div class="ui-field">
        <label class="ui-field__label">账号</label>
        <div class="ui-kv"><span class="ui-kv__v">{{ lic.name || '-' }}</span></div>
      </div>
      <div class="ui-field">
        <label class="ui-field__label">原密码</label>
        <input v-model="pwdForm.opwd" class="ui-input" type="password" placeholder="请输入原密码" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">新密码</label>
        <input v-model="pwdForm.pwd" class="ui-input" type="password" placeholder="请输入密码" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">确认密码</label>
        <input v-model="pwdForm.pwd2" class="ui-input" type="password" placeholder="确认密码" @keyup.enter="doChangePwd" />
      </div>
      <template #footer>
        <button class="ui-btn" type="button" @click="showChangePwd = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="doChangePwd">确定</button>
      </template>
    </AppModal>

    <AppModal v-model="showLog" title="引擎日志" size="lg">
      <!-- 「每 2s 自动刷新」写在框上方：光秃秃一个只读框，用户不知道它是不是活的。
           停在底部时会跟着新日志往下走；往上翻历史时不拽回去（见 fetchLog）。 -->
      <p class="eng-log__bar">
        <span class="eng-log__dot" />每 2 秒自动刷新 · 共 {{ licLog ? licLog.split('\n').length : 0 }} 行
      </p>
      <textarea
        ref="logBox"
        class="ui-textarea ui-input--mono eng-log__box"
        rows="20"
        :value="licLog"
        readonly
        spellcheck="false"
        placeholder="引擎日志（暂无内容）"
      />
      <template #footer>
        <button class="ui-btn" type="button" @click="showLog = false">关闭</button>
      </template>
    </AppModal>
  </template>
</template>

<style scoped>
/* 只读展示统一走全局 .ui-kv（原先这里是同名 scoped .kv，已合并进 style.css） */
/* .sep 随中转那三个输入框一起删除（"协议://地址:端口"那行的分隔符，已无用处） */
/* .is-locked（pointer-events:none + opacity:.6 灰显）已随"未授权整块不渲染"一起 */
</style>
