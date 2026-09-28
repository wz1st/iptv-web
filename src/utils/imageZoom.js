import { ref } from 'vue'

// 图片放大预览的**共享状态**。
export const zoomSrc = ref('')
export const zoomAlt = ref('')
/** 大图下方的操作按钮（数组，元素 {label, danger?, onClick}）。 */
export const zoomButtons = ref([])

// 打开放大预览。
export function openImageZoom(src, alt = '', buttons = []) {
  if (!src) return
  zoomSrc.value = String(src)
  zoomAlt.value = alt || ''
  zoomButtons.value = Array.isArray(buttons) ? buttons : []
}

export function closeImageZoom() {
  zoomSrc.value = ''
  zoomAlt.value = ''
  zoomButtons.value = []
}
