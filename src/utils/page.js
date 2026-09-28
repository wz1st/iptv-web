import { ref } from 'vue'
import { post, upload } from '@/api/http'
import { notify, loadingShow, loadingHide, displayResult } from '@/utils/feedback'

// 页面级数据装载。
export function usePageData(loader, initialQuery = {}) {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const query = ref({ ...initialQuery })

  async function load(nextQuery = {}) {
    query.value = { ...query.value, ...nextQuery }
    loading.value = true
    error.value = null
    try {
      data.value = await loader(query.value)
    } catch (e) {
      error.value = e
      if (e?.message !== '登录已失效') notify(e?.message || '加载失败', 'danger')
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, query, load }
}

// 提交动作 —— 一个动作一条路由，请求体是 JSON。
export async function submitAction(url, body = {}, opts = {}) {
  loadingShow()
  try {
    const res = await post(url, body)
    if (!opts.silent) displayResult(res)
    if (res.code >= 1 && typeof opts.reload === 'function') {
      await opts.reload()
    }
    return res
  } catch (e) {
    if (!opts.silent) notify(e?.message || '提交失败', 'danger')
    return { code: 0, msg: e?.message || '提交失败', type: 'danger' }
  } finally {
    loadingHide()
  }
}

// 开关类动作 —— **乐观更新 + 失败回滚**，并且**不重取整页数据**。
export async function submitSwitch(url, body = {}, opts = {}) {
  const { apply, revert, successMsg, successId, silent } = opts
  if (typeof apply === 'function') apply()
  let res
  try {
    res = await post(url, body)
  } catch (e) {
    res = { code: 0, msg: e?.message || '提交失败', type: 'danger' }
  }
  if (res && res.code >= 1) {
    if (!silent) notify(successMsg || res.msg || '设置成功', 'success', 2000, successId)
  } else {
    if (typeof revert === 'function') revert()
    notify(res?.msg || '设置失败，已恢复原状态', 'danger', 3200)
  }
  return res
}

// 文件上传后统一处理 —— 旧版是 uploadIcon/uploadBj/uploadLogo 等函数。
// opts.fields 可携带随文件一起提交的普通字段（如 EPG 台标要带 epgname）。
export async function submitUpload(url, file, fieldName, opts = {}) {
  loadingShow()
  try {
    const res = await upload(url, file, fieldName, opts.fields || {})
    if (!opts.silent) displayResult(res)
    if (res.code >= 1 && typeof opts.reload === 'function') await opts.reload()
    return res
  } catch (e) {
    if (!opts.silent) notify(e?.message || '上传失败', 'danger')
    return { code: 0, msg: e?.message || '上传失败', type: 'danger' }
  } finally {
    loadingHide()
  }
}
