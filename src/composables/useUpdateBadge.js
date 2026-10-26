// 登录后静默检测各组件新版本 → 菜单/标签红点 + 可关闭的更新提醒。
//
// 状态是模块级单例（登录会话级）：SPA 期间一直存活；退出登录走整页跳转
// （window.location.href 到登录页）会重新加载脚本 ⇒ 单例随之清零，
// 满足"本次登录直到退出"的语义（红点与提醒都在这一次会话里有效）。
//
// 三套独立状态，别再混在一起：
//   badges[k]  是否有"待处理的新版本"（来自静默检测，红点与提醒的共同来源）。
//   ack[k]     红点已读：进入对应页面 / tag 后清零（红点消失，但提醒仍在）。
//   tipsOff[k] 提醒已关：用户点 X 或点对应按钮后清零（只影响 tip，不影响红点）。
//
// 五个组件键：
//   web   管理系统 / 前端整包
//   engine 授权引擎（在线升级页与进阶功能页共用同一个键 ⇒ 一处处理，两处联动）
//   qh    清和壳编译基底
//   lt    骆驼壳编译基底
//   mytv  MyTV 编译基底（仅授权时参与红点/提醒）
import { reactive } from 'vue'
import { post } from '@/api/http'
import { API } from '@/api/endpoints'
import { isLic } from '@/utils/site'

const KEYS = ['web', 'engine', 'qh', 'lt', 'mytv']

const state = reactive({
  // 各组件是否有"待处理的新版本"（红点与提醒的共同来源）。
  badges: { web: false, engine: false, qh: false, lt: false, mytv: false },
  // 红点是否已读（进入对应页面 / tag 后清零）。
  ack: { web: false, engine: false, qh: false, lt: false, mytv: false },
  // 提醒是否被主动关掉（点 X 或点对应按钮后清零）。
  tipsOff: { web: false, engine: false, qh: false, lt: false, mytv: false },
  checked: false,
  checking: false,
})

// mytv 仅在授权（侧栏才显示 MyTV 标签）时参与红点/提醒，避免给看不到的入口挂点。
function visible(k) {
  if (k === 'mytv' && !isLic.value) return false
  return true
}

// 某组件当前是否该亮红点：有待更新 + 还没进过对应页面 / tag。
export function hasBadge(k) {
  return visible(k) && !!state.badges[k] && !state.ack[k]
}

// 某组件的"更新提醒"是否该显示：有待更新 + 用户还没主动关掉（与红点已读无关）。
export function tipVisible(k) {
  return visible(k) && !!state.badges[k] && !state.tipsOff[k]
}

// 进入对应页面 / tag 时调用：本次登录期内取消该红点（提醒随之保留，直到点 X 或点按钮）。
// engine 键被在线升级页与进阶功能页共用 ⇒ 进入任一页都会清掉两处的引擎红点。
export function clearBadge(k) {
  if (KEYS.includes(k)) state.ack[k] = true
}

// 用户主动关闭提醒：本次登录期内不再显示该 tip（红点仍在，点进页面才清）。
// 也用于"点击对应按钮"主动清除（见各面板的处理函数）。engine 键共用 ⇒ 一处关，两处都关。
export function dismissTip(k) {
  if (KEYS.includes(k)) state.tipsOff[k] = true
}

// 登录后静默盘点（只跑一次）。后端不写 Docker 日志，失败静默吞掉，最多少亮一个红点。
export async function runSilentCheck() {
  if (state.checking || state.checked) return
  state.checking = true
  try {
    const res = await post(API.adminUpdataSilentCheck)
    if (res && res.code === 1 && res.data) {
      const d = res.data
      for (const k of KEYS) state.badges[k] = !!d[k]
    }
  } catch {
    // 静默：盘点失败不影响正常使用。
  } finally {
    state.checking = false
    state.checked = true
  }
}

export function useUpdateBadge() {
  return { state, hasBadge, tipVisible, clearBadge, dismissTip, runSilentCheck }
}
