/**
 * 频道分组编辑弹窗的**回填规则**（纯函数，无 Vue 依赖 ⇒ 可直接单测）。
 *
 * 为什么单独抽出来：`rules` 这一个字段在两种聚合类型下含义完全不同 ——
 *   autoRe   → 正则表达式（填在「正则表达式」输入框里）
 *   autoEpgs → 逗号分隔的 EPG id 列表（填在多选下拉里）
 * 之前回填逻辑内联在组件里、且一股脑塞进 `rulesRe`，导致再次打开编辑弹窗时
 * 已保存的 EPG 选择**不显示**，用户一保存就把该分组的 EPG 聚合规则清空。
 *
 * 后端 `SaveCategory` 把 `ruleEpgs`（逗号串）写进 `ca.Rules`，
 * 所以前端必须按 `type` 分流回填。
 */

/** 把后端存的 "1,2,3" 解析成 EPG id 数组（存的是字符串，前端要数字）。 */
export function parseRuleEpgs(rules) {
  if (!rules) return []
  return String(rules)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/** 聚合模式：autoRe / autoEpgs / 空（普通分组）。 */
export function autoModeOf(type) {
  return type === 'autoRe' ? 'autoRe' : type === 'autoEpgs' ? 'autoEpgs' : ''
}

/** 是否是聚合分组（普通分组恒 false）。 */
export function isAutoType(category) {
  const t = category?.type ?? ''
  return t === 'autoRe' || t === 'autoEpgs'
}

/**
 * 按分组类型回填编辑表单。
 *
 * @param {object} c 后端返回的分组记录（至少含 id/name/type/rules）
 * @returns {{caForm: object, autoMode: string, ruleEpgs: number[]}}
 */
export function buildCaForm(c) {
  const t = c?.type ?? ''
  return {
    caForm: {
      caId: String(c?.id ?? ''),
      caname: c?.name ?? '',
      caua: c?.ua ?? '',
      // 聚合分组恒开中转（历史数据可能没开，进编辑时一并纠正）
      proxy: isAutoType(c) ? true : !!(c?.proxy),
      autoRename: !!(c?.autoRename),
      ku9: c?.ku9 ?? '',
      autoType: t,
      // autoRe 才是正则；autoEpgs 的 rules 是 EPG id 列表 ⇒ 这里必须留空
      rulesRe: t === 'autoRe' ? (c?.rules ?? '') : '',
    },
    autoMode: autoModeOf(t),
    // autoEpgs 才有"已选中的 EPG"，其它类型一律空
    ruleEpgs: t === 'autoEpgs' ? parseRuleEpgs(c?.rules) : [],
  }
}
