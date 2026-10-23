// 在线升级的阶段名 —— 前后端共用的那份名单的唯一出处。
//
// 后端在 iptv-api/until/updataState.go 里定义同名常量（UpdataPhaseCheck /
// UpdataPhaseFetch / UpdataPhaseVerify / UpdataPhaseStage / UpdataPhaseReady /
// UpdataPhaseApply / UpdataPhaseDone / UpdataPhaseFailed），前端这边按同样的
// 字符串判定。两边各写一份名单，改一个漏一个 ⇒ 遮罩要么不显示、要么显示错。
//
// 整个流程按"三段"分：
//
//   check → fetch → verify   **下载段**：把 30MB 的包从 GitHub 拉下来并校验
//   ready                    包已就绪、等人点"确认升级"（刻意不算进行中）
//   stage → apply            **安装段**：启动器替换文件并重启 api
//   done / failed            终态
//
// 下载段与安装段各有各的遮罩：
//   - 下载遮罩在 utils/download.js，升级遮罩在 utils/upgrade.js。
// 两者都会问 /api/updata/status，但只认自己那几段阶段 —— 认串了就会出现
// "下载完却弹出一句『未能触发升级，请重试』"这种自相矛盾的话。

// PHASES 阶段名常量。
export const PHASES = {
  CHECK: 'check',
  FETCH: 'fetch',
  VERIFY: 'verify',
  STAGE: 'stage',
  READY: 'ready',
  APPLY: 'apply',
  DONE: 'done',
  FAILED: 'failed',
}

// DOWNLOAD_PHASES 是"正在下载"这一段的阶段名。
export const DOWNLOAD_PHASES = [PHASES.CHECK, PHASES.FETCH, PHASES.VERIFY]

// UPGRADE_PHASES 是"正在安装（替换文件 + 重启）"这一段的阶段名。
export const UPGRADE_PHASES = [PHASES.STAGE, PHASES.APPLY]

// isDownloadPhase 判断某个阶段是不是"正在下载"。
export function isDownloadPhase(phase) {
  return DOWNLOAD_PHASES.includes(phase || '')
}

// isUpgradePhase 判断某个阶段是不是"正在安装"。
export function isUpgradePhase(phase) {
  return UPGRADE_PHASES.includes(phase || '')
}
