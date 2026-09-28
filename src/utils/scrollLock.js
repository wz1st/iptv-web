// body 滚动锁 —— 按「当前开着几个弹窗」计数。
let count = 0

export function lockBodyScroll() {
  if (count === 0) document.body.style.overflow = 'hidden'
  count++
}

export function unlockBodyScroll() {
  if (count === 0) return // 没锁过就别减成负数
  count--
  if (count === 0) document.body.style.overflow = ''
}
