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
//
// ## 「刚点确认」有一段抢跑窗口，不能按「没在升级」处理
//
// markUpgradeStarted 先乐观上遮罩、再 post /api/updata/run。若第一拍轮询**抢在**
// run 被服务端处理之前到达，读到的还是上次下载留下的 phase=ready —— 后端把
// ready 判成 running=false（那一段刻意不算进行中）。于是遮罩刚上就被自己撤掉、
// 轮询也被停掉，直到 F5 才恢复。
//
// 所以有一个**宽限期**：本机刚点过确认的 GRACE_MS 内，服务端说"没在升级"
// 一律当作"还没轮到"，继续轮询。真失败（网络不通、跨版本不让升）都会在
// 宽限期后自然暴露 —— 那时 phase 已是 failed 或压根没有变化。
//
// ## 完成后主动刷新
//
// api 进程被重启 ⇒ 前端连的是**新版本**，但浏览器手上的 JS 还是旧的。
// 只撤遮罩不刷新，用户会停在一个"界面看着是新版、行为却是旧版"的状态
// （路由表、接口字段对不上都要过很久才暴露）。所以 done ⇒ 撤遮罩 + 刷新。
// 刷新用 sessionStorage 记一次，避免"刷新后又读到 done"形成二次刷新。

const KEY = 'iptv-upgrading-at'
const DONE_KEY = 'iptv-upgrade-done-at'
// 本地兜底时限。升级包 30MB 级，正常几分钟内结束；15 分钟还不结束就是出事了。
const STALE_MS = 15 * 60 * 1000
// 抢跑宽限：点「确认升级」后这段时间内，服务端的 running=false 不作数。
// run 是本地接口（落盘 + 通知启动器），正常毫秒级；20s 足够覆盖调度抖动。
const GRACE_MS = 20 * 1000

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

// 本机发起升级的时刻（内存，不落盘）：只用于上面说的抢跑宽限期。
// 它和 readMark() 不同 —— 后者每次成功轮询都会刷新，拿它判"刚点过"永远为真。
let requestedAt = 0

// inGrace 还在"刚点确认"的宽限期内吗。
function inGrace() {
  return requestedAt > 0 && Date.now() - requestedAt < GRACE_MS
}

// reloadOnce 升级完成后刷新页面，且**只刷一次**。
//
// 防的是"刷新后又读到 phase=done ⇒ 再刷一次"的回环：刷新本身是一个新的
// 会话，服务端状态还是 done。所以用 sessionStorage 打一个"这一轮已经因为
// 完成而刷新过"的标记，读到就跳过。
function reloadOnce() {
  let done = 0
  try { done = Number(sessionStorage.getItem(DONE_KEY)) || 0 } catch { /* 同上 */ }
  if (done && Date.now() - done < STALE_MS) return
  try { sessionStorage.setItem(DONE_KEY, String(Date.now())) } catch { /* 写不了就当没标记，顶多多刷一次 */ }
  // 换新版本要用新版本的前端路由表，所以走整页跳转而不是 SPA 内的 replace。
  window.location.reload()
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
  requestedAt = Date.now()
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
    requestedAt = 0
    notify('升级状态超过 15 分钟没有更新，遮罩已解除；若系统仍未更新请手动刷新页面', 'warning', 6000)
    return
  }
  try {
    const res = await post(API.adminUpdataStatus)
    const view = res?.data
    if (!view) return
    if (view.running) {
      // 服务端已经认下这轮升级 ⇒ 抢跑窗口结束，宽限期不再有意义。
      requestedAt = 0
      apply(view)
      writeMark(Date.now())
      return
    }
    // 抢跑窗口内，服务端说"没在升级"不作数：那一拍的 phase 极可能是上一次
    // 下载留下的 ready（后端刻意把它判成非进行中），照它撤遮罩就会把用户
    // 刚点的确认吞掉。继续轮询，下一拍就会读到真正的 apply。
    if (state.running && inGrace()) return
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
        // 主动刷新：api 刚被重启过，浏览器手上的还是旧版前端。
        // 先撤遮罩再刷新，反正是整页跳转，视觉上是一气呵成的。
        apply({ running: false })
        notify('升级完成，正在刷新页面…', 'success', 2000)
        writeMark(0)
        requestedAt = 0
        reloadOnce()
        return
      } else {
        // 遮罩开着、服务端却说既没在升级也没失败：最可能是 /api/updata/run
        // 压根没送达（网络抖动、登录态在途中失效）。静默撤遮罩会让用户
        // 面对"点完就没了、什么也没发生"，所以必须说清。
        notify('未能触发升级，已解除遮罩，请重试', 'warning', 5000)
      }
    }
    apply(view)
    writeMark(0)
    requestedAt = 0
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

// abortUpgrade 主动放弃这轮升级：撤遮罩 + 停轮询 + 清标记。
//
// 给「POST /api/updata/run 没触发成功」用 —— 那时遮罩已经上了，但服务端
// 根本没开始升级，不主动撤的话用户会盯着一块遮罩直到 15 分钟兜底。
export function abortUpgrade(msg) {
  stopUpgradeWatch()
  apply({ running: false })
  writeMark(0)
  requestedAt = 0
  try { sessionStorage.removeItem(DONE_KEY) } catch { /* 同上 */ }
  if (msg) notify(msg, 'danger', 5000)
}

// upgradeRunning 供路由/页面做只读判断（升级中不触发"离开页面"确认框之类的动作）。
export function upgradeRunning() {
  return state.running
}
