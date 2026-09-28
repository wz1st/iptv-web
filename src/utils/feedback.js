import { reactive, readonly } from 'vue'
import { toast } from 'vue-sonner'

// 全局反馈状态：Toast 提示 + 全屏 loading。

const state = reactive({
  loadingCount: 0,
})

export function useFeedback() {
  return readonly(state)
}

/** 后端 type 归一化 —— 兼容历史遗留的 'error' */
function normalizeType(type) {
  if (type === 'error') return 'danger'
  return ['success', 'danger', 'warning', 'info'].includes(type) ? type : 'info'
}

// 弹出提示。签名刻意与 lightyear.notify(msg, type, duration) 兼容，
export function notify(msg, type = 'info', duration = 3000, id) {
  if (!msg) return
  const kind = normalizeType(type)
  const opts = duration > 0 ? { duration } : {}
  if (id) opts.id = String(id)

  switch (kind) {
    case 'success':
      return toast.success(String(msg), opts)
    case 'danger':
      return toast.error(String(msg), opts)
    case 'warning':
      return toast.warning(String(msg), opts)
    default:
      return toast.info(String(msg), opts)
  }
}

/** 兼容旧调用点：ToastLayer 已由 sonner 的 Toaster 取代，这里保留空实现 */
export function dismiss() {}

export function loadingShow() {
  state.loadingCount += 1
}

export function loadingHide() {
  state.loadingCount = Math.max(0, state.loadingCount - 1)
}

// 包裹一个异步操作，自动处理 loading 与错误提示。
// 返回 { ok, data } 方便调用方判断。
export async function withLoading(fn, { silent = false } = {}) {
  loadingShow()
  try {
    const data = await fn()
    if (!silent && data && typeof data === 'object' && 'code' in data) {
      displayResult(data)
    }
    return { ok: true, data }
  } catch (err) {
    if (!silent) notify(err?.message || '操作失败', 'danger')
    return { ok: false, data: null, error: err }
  } finally {
    loadingHide()
  }
}

/** 按后端返回的 { code, msg, type } 决定提示样式 */
export function displayResult(res) {
  if (!res || typeof res !== 'object') return
  const msg = res.msg || ''
  let type = res.type
  if (!type) type = res.code >= 1 ? 'success' : 'danger'
  if (msg) notify(msg, type, res.code >= 1 ? 2500 : 4000)
}
