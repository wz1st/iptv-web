// 「授权提示弹窗是否已弹过」的会话标记。

const KEY = 'iptv-license-notice-seen'

// 读标记。sessionStorage 在隐私模式 / 被策略禁用时会抛异常，
export function hasSeenLicenseNotice() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** 记下"已弹过"。写失败不影响本次弹窗（只是下次刷新可能再弹一次）。 */
export function markLicenseNoticeSeen() {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch { /* 存储不可用时静默降级 */ }
}

// 清掉标记 —— 登录成功、退出登录时各调一次。
export function clearLicenseNoticeSeen() {
  try {
    sessionStorage.removeItem(KEY)
  } catch { /* 同上 */ }
}
