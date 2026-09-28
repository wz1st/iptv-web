// 与 Go 后端通信的统一封装。

function isRedirectPayload(text) {
  return typeof text === 'string' && text.includes('/admin/login')
}

export class ApiError extends Error {
  constructor(message, payload) {
    super(message)
    this.name = 'ApiError'
    this.payload = payload
  }
}

/** 登录失效统一处理 */
function handleUnauthorized() {
  if (window.location.pathname.startsWith('/admin')) {
    window.location.href = '/admin/login'
  }
}

// 统一的后端响应收尾处理。
function handleResponse(res, text) {
  if (res.status === 401 || isRedirectPayload(text)) {
    handleUnauthorized()
    throw new ApiError('登录已失效', null)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new ApiError('响应解析失败', text)
  }

  // 到这一步鉴权是通的：不再按响应体的 code 判"登录失效"（理由见文件头）。
  // code=5 是「设置成功，刷新页面生效」，调用方自己决定要不要 reload。
  return data
}

// 核心 POST：请求体是 JSON，动作由 URL 表达。
export async function post(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    credentials: 'same-origin',
  })

  return handleResponse(res, await res.text())
}

// 文件上传：multipart/form-data。
export async function upload(url, file, fieldName, fields = {}) {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    fd.append(k, String(v))
  })
  fd.append(fieldName, file)

  const res = await fetch(url, {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
  })

  return handleResponse(res, await res.text())
}

// 公开站点的只读 GET 探针。
export async function getPublic(url) {
  const res = await fetch(url, { credentials: 'same-origin' })

  return handleResponse(res, await res.text())
}
