import { reactive, readonly } from 'vue'
import { post } from '@/api/http'
import { API } from '@/api/endpoints'
import { isDownloadPhase } from '@/utils/updataPhase'

// 在线升级**下载阶段**的遮罩状态。
//
// ## 为什么与「升级阶段」分成两套
//
// 升级阶段（utils/upgrade.js）的遮罩靠服务端 running 判据维持：api 进程会被
// 启动器重启，浏览器可能刷新、可能断线，所以真相必须放服务端 + localStorage
// 标记兜底。
//
// 下载阶段不一样：它就是**一次普通的同步 HTTP 请求** —— 请求返回 = 下载结束，
// 请求抛错 = 下载失败，边界完全由那个 promise 决定。刷新页面时请求一起没了
// （服务端仍会把包下完，下次点「检测更新」会命中"复用已下载产物"）。
// 所以它不需要 localStorage 标记，也不需要接服务端那套"完成/失败"收尾 ——
// 混进 utils/upgrade.js 只会让"下载完待确认"与"升级完成"两件事互相误判：
// 服务端在下载结束那一刻把 phase 置为 ready，而 ready 刻意不算 running，
// 于是下载刚结束就会被当成"升级没触发"，弹一句"未能触发升级，请重试"。
//
// ## 进度从哪来
//
// 服务端在下载期间持续写状态（phase = check/fetch/verify，running=true），
// 这里轮询 /api/updata/status 取 percent/msg 刷新进度条。
//
// ## 宽限期：刚点下载时，服务端状态可能还是上一轮留下的
//
// 点下"确认下载"到服务端真正开始下载之间有一个网络往返。这期间服务端状态
// 文件里还是**上一次**下载留下的值（常见是 ready/95%）。若直接采信，进度条
// 会先闪一个 95% 再掉回 2%，或者被"服务端说没在下载"提前收掉。
// 所以：宽限期内不采信服务端的"不在下载"结论；见到过一次下载阶段之后
// （seen=true）才认为服务端说的就是当前这轮。

// GRACE_MS 是"刚点下载"的宽限窗口。服务端一收到请求就会写 phase=check，
// 正常是毫秒级；留 20 秒是为了容忍网络抖动与调度延迟。
const GRACE_MS = 20 * 1000

// state 是下载期遮罩的唯一真相（放模块级，跨路由存活）。
const state = reactive({
  running: false,
  kind: '',
  percent: 0,
  msg: '',
})

let timer = null
// startedAt 是本机发起这次下载的时刻，只用于上面的宽限期。
let startedAt = 0
// seen 表示"已经见过一次下载阶段"：见到之前不采信服务端的"结束"结论。
let seen = false

export function downloadState() {
  return readonly(state)
}

// startDownload 由「点确认下载」的一方调用：立刻上遮罩并起轮询。
//
// 不等服务端回话 —— 30MB 的包在慢网络下要下好几分钟，这期间用户必须看到
// "正在下载"和进度，否则只能对着一个不动的按钮猜是不是卡死了。
export function startDownload(kind) {
  stopDownload()
  state.running = true
  state.kind = kind || ''
  state.percent = 0
  state.msg = '正在连接服务器…'
  startedAt = Date.now()
  seen = false
  poll()
  timer = setInterval(poll, 700)
}

// stopDownload 撤遮罩。下载成功、失败、异常三条路径都要走它。幂等。
export function stopDownload() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  state.running = false
  state.percent = 0
  state.msg = ''
  state.kind = ''
  startedAt = 0
  seen = false
}

// startDownloadWatch 在应用启动时调用一次：问一次服务端，如果它正在下载
// （多半是用户下载到一半刷新了页面）就把遮罩接回来。
//
// 这一步**必须有**：刷新会把那次下载请求一起丢掉，但服务端的下载线程还在跑
// （服务端会一直把包下完，最后把 phase 置成 ready）。没有它，用户刷新后
// 面对的是"进度条不见了，但后台还在下"这种完全说不清的状态。
//
// 幂等：已经在下载时只刷新进度，不重起定时器。
export function startDownloadWatch() {
  if (timer) return
  if (!shouldWatch()) return
  post(API.adminUpdataStatus)
    .then((res) => {
      const view = res?.data
      if (!view || !isDownloadPhase(view.phase)) return
      resumeDownload(view)
    })
    .catch(() => { /* 没登录 / 网络不通：下载遮罩不该出现 */ })
}

// resumeDownload 在"发现服务端正在下载"时接管。
//
// 幂等：已经在下载时只刷新进度，不重起定时器。
export function resumeDownload(view) {
  if (!view || !isDownloadPhase(view.phase)) return
  if (!state.running) {
    state.running = true
    state.kind = view.kind || ''
    state.percent = 0
    state.msg = '正在下载升级包…'
    startedAt = Date.now()
    seen = true
  }
  applyView(view)
  if (!timer) {
    poll()
    timer = setInterval(poll, 700)
  }
}

function applyView(view) {
  state.percent = Math.max(0, Math.min(100, Number(view.percent) || 0))
  if (view.msg) state.msg = view.msg
}

// poll 问一次服务端当前进度。
//
// 失败时**不动**遮罩：真正的成败由下载请求自己的 promise 判定（那边会弹窗
// 报出原因）。这里只负责刷新进度条，网络抖一下不该把遮罩撤了。
async function poll() {
  try {
    const res = await post(API.adminUpdataStatus)
    const view = res?.data
    if (!view) return
    if (isDownloadPhase(view.phase)) {
      // 阶段对得上才采信进度。kind 对不上（另一条链路的下载）就当没看见 ——
      // 撤掉自己的遮罩去显示别人的进度，比进度条乱跳更难解释。
      if (state.kind && view.kind && view.kind !== state.kind) return
      seen = true
      applyView(view)
      return
    }
    // 服务端说"不在下载阶段"了。
    // 但刚点下载时可能读到的还是上一轮的状态 ⇒ 宽限期内不认。
    if (!seen && Date.now() - startedAt < GRACE_MS) return
    stopDownload()
  } catch {
    /* 轮询失败不动遮罩，等下一拍 */
  }
}

// 登录页/安装向导里没有升级可言：跳过轮询，顺带避免未登录时每秒一个 401。
const SKIP_PATHS = ['/admin/login', '/install', '/install-log']

function shouldWatch() {
  return !SKIP_PATHS.includes(window.location.pathname)
}
