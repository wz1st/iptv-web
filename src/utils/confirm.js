import { reactive } from 'vue'

// 全局确认对话框 —— 替代 jquery-confirm 的 confirmAndSubmit / $.alert。

const state = reactive({
  visible: false,
  title: '提示',
  content: '',
  okText: '确定',
  cancelText: '取消',
  okVariant: 'primary', // primary | danger
  showCancel: true,
  resolve: null,
})

export function useConfirm() {
  return { confirm, notifyBox }
}

/* 确认框，返回 Promise<boolean> */
export function confirm(content, opts = {}) {
  state.title = opts.title || '提示'
  state.content = content
  state.okText = opts.okText || '确定'
  state.cancelText = opts.cancelText || '取消'
  state.okVariant = opts.okVariant || 'primary'
  state.showCancel = opts.showCancel !== false
  state.visible = true

  return new Promise((resolve) => {
    state.resolve = resolve
  })
}

/** 只有一个确定按钮的提示框，兼容旧 $.alert 行为 */
export function notifyBox(content, opts = {}) {
  return confirm(content, { ...opts, showCancel: false, okText: opts.okText || '确定' })
}

export function resolveConfirm(value) {
  state.visible = false
  if (state.resolve) {
    state.resolve(value)
    state.resolve = null
  }
}

export function confirmState() {
  return state
}
