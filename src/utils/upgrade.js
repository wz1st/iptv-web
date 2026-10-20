import { reactive, readonly } from 'vue'
import { post } from '@/api/http'
import { API } from '@/api/endpoints'
import { notify } from '@/utils/feedback'

// 在线升级的全局遮罩状态 —— 项目里最标准的「状态放 utils / 渲染放 components」
// 范式（见 utils/confirm.js + components/ConfirmHost.vue）。
//
// ## 为什么状态要放服务端而不是只放前端
//
// 升级一旦触发，api 进程会被启动器重启（iptv-start/main.go 的 restartUpdated）。
// 这中间浏览器里这个窗口如果只是内存里的一个 ref，用户**刷新一下页面或切个路由**
// 遮罩就没了 —— 而后台其实正在替换文件，这时任何操作都可能撞上半个新半个旧的
// 运行态。所以真相必须放在服务端：前端只管轮询 /api/updata/status。
//
// ## 本地标记只为了「刷新后不闪一下」
//
// 刷新后到第一次轮询返回之间有几百毫秒，这段时间如果没有遮罩，用户会看到后台
// 界面原样闪一下再被盖住。用一个 localStorage 标记把这段缝上；它**不是判据**，
// 真正的判据永远是服务端那句 running。
//
// ## 请求失败时不撤遮罩
//
// api 正在重启 ⇒ 所有请求都会失败/502，这恰恰是「升级正在收尾」的信号。
// 但网络真断了也会这样，所以另有一个兜底：本地记下开始时间，超过 15 分钟
// 无论如何撤掉遮罩并说清情况 —— 遮罩永久卡死比误报一次糟糕得多。

const KEY = 'iptv-upgrading-at'
// 本地兜底时限。升级包 30MB 级，正常几分钟内结束；15 分钟还不结束就是出事了。
const STALE_MS = 15 * 60 * 1000

const state = reactive({
  running: false,
  kind: '',
  phase: '',
  percent: 0,
  msg: '',
  failed: '',
})

let timer = null

export function upgradeState() {
  return readonly(state)
}

function readMark() {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

function writeMark(at) {
  try {
    if (at) localStorage.setItem(KEY, String(at))
    else localStorage.removeItem(KEY)
  } catch { /* 隐私模式下写不了，只是刷新时少一层"不闪一下" */ }
}

function apply(view) {
  state.running = !!view.running
  state.kind = view.kind || ''
  state.phase = view.phase || ''
  state.percent = Number(view.percent) || 0
  state.msg = view.msg || ''
  state.failed = view.failed || ''
}

// markUpgradeStarted 由「点开始升级」的一方调用：立刻上遮罩，不等服务端回话。
export function markUpgradeStarted(kind) {
  writeMark(Date.now())
  apply({
    running: true,
    kind: kind || '',
    phase: 'apply',
    percent: 96,
    msg: '正在替换文件并重启管理系统，期间请勿关闭页面…',
    failed: '',
  })
  // 轮询是按需的（页面加载时问一次就不升级就收工），所以这里必须自己把
  // 轮询拉起来 —— 否则遮罩会一直停在 96%，直到用户刷新页面。
  startUpgradeWatch()
}

async function poll() {
  // 兜底：遮罩开着但本地计时已超期 ⇒ 无条件撤掉。
  const marked = readMark()
  if (state.running && marked && Date.now() - marked > STALE_MS) {
    stopUpgradeWatch()
    apply({ running: false })
    writeMark(0)
    notify('升级状态超过 15 分钟没有更新，遮罩已解除；若系统仍未更新请手动刷新页面', 'warning', 6000)
    return
  }
  try {
    const res = await post(API.adminUpdataStatus)
    const view = res?.data
    if (!view) return
    if (view.running) {
      apply(view)
      writeMark(Date.now())
      return
    }
    // 服务端说没在升级：撤遮罩 + 停轮询。
    // 停掉是刻意的 —— 后台绝大多数时间都不在升级，为一个恒为 false 的接口
    // 每秒打一次纯属浪费；而且这种常驻轮询一旦碰上"整页跳转"类逻辑就会
    // 放大成页面反复刷新（登录页就是这么被坑过的）。真要升级时
    // markUpgradeStarted 会把轮询重新拉起来。
    const wasRunning = state.running
    stopUpgradeWatch()
    if (wasRunning) {
      if (view.phase === 'failed') {
        notify(view.failed || '升级失败，请到「在线升级」页重试', 'danger', 6000)
      } else if (view.phase === 'done') {
        notify('升级完成，管理系统已重启', 'success', 4000)
      }
    }
    apply(view)
    writeMark(0)
  } catch (e) {
    // 登录失效（401）：这台浏览器本来就没登录，升级状态跟它无关。
    // 直接停掉轮询，别每秒打一次注定 401 的请求 —— 登录成功是整页跳转，
    // 页面重载后 App.vue 会重新起轮询，所以停掉不会有副作用。
    if (e?.message === '登录已失效') {
      stopUpgradeWatch()
      return
    }
    // 请求失败：api 正在重启就是这个样子。保持遮罩不动，等下一拍。
  }
}

// 登录页/安装向导里没有升级可言：跳过轮询，顺带避免未登录时每秒一个 401。
const SKIP_PATHS = ['/admin/login', '/install', '/install-log']

function shouldWatch() {
  return !SKIP_PATHS.includes(window.location.pathname)
}

// startUpgradeWatch 在应用启动时调用一次（main.js 或 App.vue）。
//
// 轮询是「按需」而不是「常驻」的：页面加载时问一次，没在升级就彻底不再问；
// 只有本地留着升级标记（本机发起过）或调用 markUpgradeStarted 才真正开始轮询。
// 幂等：重复调用不会起第二个定时器。
export function startUpgradeWatch() {
  if (timer) return
  if (!shouldWatch()) return
  // 本地没有升级标记 ⇒ 页面加载时问这一次当判据，确认"确实没在升级"就收工。
  if (!readMark()) {
    pollOnceAtBoot()
    return
  }
  // 刷新恢复：本地有标记就先罩上，等第一次轮询去确认或撤销。
  apply({ running: true, phase: 'apply', percent: 96, msg: '正在确认升级状态…' })
  poll()
  timer = setInterval(poll, 1000)
}

// pollOnceAtBoot 只问一次，不起定时器。问出"正在升级"才转成常驻轮询。
function pollOnceAtBoot() {
  post(API.adminUpdataStatus)
    .then((res) => {
      const view = res?.data
      if (!view?.running) return
      apply(view)
      writeMark(Date.now())
      startUpgradeWatch()
    })
    .catch(() => { /* 没登录 / 网络不通：登录页自己会处理，这里不打扰 */ })
}

export function stopUpgradeWatch() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

// upgradeRunning 供路由/页面做只读判断（升级中不触发"离开页面"确认框之类的动作）。
export function upgradeRunning() {
  return state.running
}
