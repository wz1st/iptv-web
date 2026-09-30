// 站点运行时配置。
import { computed, ref } from 'vue'

export const siteName = ref('清和IPTV管理系统')
export const version = ref('')

/** 是否永久授权（用于侧栏是否显示 MyTV 项等） */
export const isLic = ref(false)

/** 授权等级。4 = 定制授权 —— 只有它能用「下载页编辑」与「定制APK」。 */
export const licType = ref(0)

/** 是否定制授权。后端 dao.License.Type == 4 是这个等级的判据。 */
export const isCustom = computed(() => licType.value === 4)

// 授权账号**是否处于登录态（后端 dao.Lic.Status == 1）。
export const licLogged = ref(false)

/** 作者模块开关（对应旧模板的 Author） */
export const needAuthor = ref(0)

// 系统是否已安装 —— 与后端 router.installGate、
// bootstrap/install.go 使用同一份事实（iptv.db + config.yml + install.lock）。
export const installed = ref(true)

/** 引导数据是否已就位。仅调试/自检用，业务代码不必读它。 */
export const bootLoaded = ref(false)

/** 拉取站点配置。永不抛错：失败即沿用默认值，返回 false。 */
export async function loadBoot() {
  try {
    const res = await fetch('/api/site/boot', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return false

    const b = await res.json()
    if (typeof b !== 'object' || b === null) return false

    if (b.site_name) siteName.value = String(b.site_name)
    if (b.version !== undefined && b.version !== null) version.value = String(b.version)
    isLic.value = Boolean(b.is_lic)
    licType.value = Number(b.lic_type ?? 0) || 0
    licLogged.value = Boolean(b.lic_logged)
    needAuthor.value = Number(b.author ?? 0) || 0
    // installed 缺失时保持默认 true（见文件头「兜底策略」）
    if (b.installed !== undefined && b.installed !== null) {
      installed.value = Boolean(b.installed)
    }
    bootLoaded.value = true
    return true
  } catch {
    return false
  }
}

export function reload() {
  window.location.reload()
}
