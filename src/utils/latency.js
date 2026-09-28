// 频道延迟（iptv_channels.speed）的解析与分档 —— 零依赖纯模块。

/** 绿色上限（不含）：< 500ms */
export const LAT_OK_MS = 500
/** 黄色上限（不含）：< 1500ms；≥ 1500 为红 */
export const LAT_WARN_MS = 1500

// 从 speed 文本里取出毫秒数。取不到（"-"、"未测过"、乱码）一律回 null
export function parseLatencyMs(speed) {
  if (speed === null || speed === undefined) return null
  const m = /^\s*(\d+(?:\.\d+)?)\s*ms\s*$/i.exec(String(speed))
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return n
}

// 分档：'ok' 绿 / 'warn' 黄 / 'bad' 红 / 'none' 无数据。
export function latencyLevel(speed) {
  const ms = parseLatencyMs(speed)
  if (ms === null) return 'none'
  if (ms < LAT_OK_MS) return 'ok'
  if (ms < LAT_WARN_MS) return 'warn'
  return 'bad'
}

/** 单元格文案：有数就归一化成 "<n>ms"，没数就 "-"（需求里的"默认 -"） */
export function latencyText(speed) {
  const ms = parseLatencyMs(speed)
  if (ms === null) return '-'
  // 引擎写的是整数毫秒；这里按整数显示，避免 "312.0ms" 这种多余精度
  return `${Math.round(ms)}ms`
}

/** 单元格 class（与 style.css 的 .lat--* 一一对应；.lat 是共用基类） */
export function latencyClass(speed) {
  return `lat lat--${latencyLevel(speed)}`
}
