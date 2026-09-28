// 触摸设备上的「点一下行 = 双击行」。

/** 落在这些元素里的点击不算"点行"。 */
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[role="switch"]',
  '[data-slot="switch"]',
  '[data-rowtap-ignore]',
].join(',')

// 当前设备的主指针是不是触摸。
export function isCoarsePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** 这次点击该不该当成"双击行"。 */
export function shouldRowTap(event) {
  if (!isCoarsePointer()) return false
  const t = event && event.target
  if (t && typeof t.closest === 'function' && t.closest(INTERACTIVE_SELECTOR)) return false
  return true
}

// `v-rowtap="() => openEdit(row)"` —— 桌面双击、触摸单击，都走同一个回调。
export const rowTapDirective = {
  mounted(el, binding) {
    el.__rowTapValue = binding.value
    el.__rowTapDbl = () => {
      if (typeof el.__rowTapValue === 'function') el.__rowTapValue()
    }
    el.__rowTapClick = (event) => {
      if (!shouldRowTap(event)) return
      if (typeof el.__rowTapValue === 'function') el.__rowTapValue()
    }
    el.addEventListener('dblclick', el.__rowTapDbl)
    el.addEventListener('click', el.__rowTapClick)
  },
  updated(el, binding) {
    el.__rowTapValue = binding.value
  },
  unmounted(el) {
    el.removeEventListener('dblclick', el.__rowTapDbl)
    el.removeEventListener('click', el.__rowTapClick)
    delete el.__rowTapValue
    delete el.__rowTapDbl
    delete el.__rowTapClick
  },
}
