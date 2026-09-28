// 无鉴权跳转处理的原始请求工具。

export async function jsonPost(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    credentials: 'same-origin',
  })

  const text = await res.text()

  if (typeof text === 'string' && text.includes('/admin/login')) {
    throw new Error('登录状态异常，请刷新页面重试')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('服务响应格式异常')
  }
}

/** 返回原始 HTML 文本（用于 Markdown 类页面，如 README / ChangeLog） */
export async function fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' })
  return res.text()
}
