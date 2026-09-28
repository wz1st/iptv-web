// Markdown 渲染 —— 替代 marked.min.js。

/* ============================ 白名单 ============================ */

/** 允许直通的标签 —— 覆盖 README/ChangeLog 里实际用到的，外加常见排版标签 */
const ALLOWED_TAGS = new Set([
  'a', 'img', 'br', 'hr', 'div', 'span', 'p', 'center',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'small', 'sub', 'sup',
  'code', 'pre', 'kbd', 'mark', 'abbr', 'cite', 'q', 'time', 'var', 'font',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'figure', 'figcaption', 'details', 'summary',
])

/** 允许保留的属性；未列出的（尤其 `on*`）一律丢弃 */
const ALLOWED_ATTRS = new Set([
  'class', 'id', 'title', 'style', 'align', 'lang', 'dir',
  'width', 'height', 'border', 'color', 'size', 'face',
  'href', 'src', 'alt', 'target', 'rel', 'name',
  'colspan', 'rowspan', 'start', 'type',
])

/** 值需要按 URL 消毒的属性 */
const URL_ATTRS = new Set(['href', 'src'])

// 标签匹配：注释 | 开/闭标签（属性值可含引号包裹的 `>`）。
// 之所以不用 `<[^>]*>`：`alt="a>b"` 这种属性值会把标签截断。
const TAG_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+(?:"[^"]*"|'[^']*'|[^"'<>])*)?\/?>/g

/** 标签内属性匹配；a[2..4] 分别是双引号/单引号/无引号的值 */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g

/** 整行只由标签与空白构成 → 当作块级 HTML，脱离 `<p>` 包裹 */
const BLOCK_HTML_RE = /^\s*(?:<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+(?:"[^"]*"|'[^']*'|[^"'<>])*)?\/?>\s*)+$/

/** 危险协议（探测前先解字符引用、剥控制字符，防 `java&#09;script:` 之类绕过） */
const DANGEROUS_PROTOCOL_RE = /^(?:javascript|vbscript|data|blob|file|about):/

/** style 里必须拦掉的东西 */
const DANGEROUS_STYLE_RE = /expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding/i

// 协议相关（以及常见）的命名实体。
const NAMED_ENTITIES = {
  Tab: '\t', NewLine: '\n', colon: ':', sol: '/', bsol: '\\', period: '.',
  num: '#', quest: '?', excl: '!', lpar: '(', rpar: ')', apos: "'",
  amp: '&', lt: '<', gt: '>', quot: '"', nbsp: '\u00a0', colon2: ':',
}

// 按浏览器的规则解一遍字符引用。
function decodeEntities(s) {
  return String(s).replace(/&#[xX][0-9a-fA-F]{1,6};?|&#\d{1,7};?|&[a-zA-Z][a-zA-Z0-9]{1,31};/g, (m) => {
    const body = m.slice(1).replace(/;$/, '') // 去掉前导 & 与可选分号
    if (body[0] === 'x' || body[0] === 'X') {
      const code = parseInt(body.slice(1), 16)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    if (body[0] === '#') {
      const code = parseInt(body.slice(1), 10)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : 'x'
  })
}

/* ============================ 基础工具 ============================ */

/** 保留合法字符引用，其余 `&` 与所有 `<` `>` `"` 转义 */
const ENTITY_RE = /&(?!#\d{1,7};|#[xX][0-9a-fA-F]{1,6};|[a-zA-Z][a-zA-Z0-9]{1,31};)/g

function escapeText(s) {
  return String(s)
    .replace(ENTITY_RE, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 属性值转义（`&` 也要转，否则 href 里的 `&jump_from=` 会被当实体） */
function attrValue(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// URL 消毒 + 相对路径规范化。
function normalizeUrl(raw) {
  const s = String(raw).trim()
  if (!s) return ''
  // 探测：先解字符引用（浏览器会做），再去掉全部空白与控制字符，
  // 这样 `java&#09;script:`、`&#106;avascript:`、` javascript:` 都会现出原形。
  const probe = decodeEntities(s)
    .replace(/[\u0000-\u0020\u00a0\u2000-\u200f\u2028\u2029]+/g, '')
    .toLowerCase()
  if (DANGEROUS_PROTOCOL_RE.test(probe)) return ''
  if (/^(?:https?:|mailto:|tel:|#|\/\/|\/)/i.test(s)) return s
  return '/' + s.replace(/^(?:\.\/)+/, '')
}

function safeStyle(raw) {
  const s = String(raw)
  // 同样要按浏览器的规则解字符引用后再探测：`express&#105;on(...)` 会被还原
  const probe = decodeEntities(s).replace(/[\u0000-\u0020]+/g, '').toLowerCase()
  return DANGEROUS_STYLE_RE.test(probe) ? '' : s
}

// 消毒单个标签。
function sanitizeTag(raw) {
  if (raw.startsWith('<!--')) return ''
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)>$/.exec(raw)
  if (!m) return null
  const name = m[2].toLowerCase()
  if (!ALLOWED_TAGS.has(name)) return null
  if (m[1] === '/') return '</' + name + '>'

  const attrs = []
  ATTR_RE.lastIndex = 0
  let a
  while ((a = ATTR_RE.exec(m[3])) !== null) {
    const key = a[1].toLowerCase()
    if (!ALLOWED_ATTRS.has(key)) continue
    let val = a[2] ?? a[3] ?? a[4] ?? ''
    if (URL_ATTRS.has(key)) {
      val = normalizeUrl(val)
      if (!val) continue
    } else if (key === 'style') {
      val = safeStyle(val)
      if (!val) continue
    }
    attrs.push(key + '="' + attrValue(val) + '"')
  }

  // 外链新窗口打开时补 rel，README 里的 `<a target="_blank">` 都没写
  if (name === 'a' && attrs.includes('target="_blank"') && !attrs.some((x) => x.startsWith('rel='))) {
    attrs.push('rel="noopener noreferrer"')
  }

  return '<' + name + (attrs.length ? ' ' + attrs.join(' ') : '') + (m[4] ? ' /' : '') + '>'
}

/* ============================ 行内解析 ============================ */

// 行内元素解析。顺序很重要：
function inline(text) {
  const stash = []
  const keep = (html) => {
    stash.push(html)
    return '\u0000' + (stash.length - 1) + '\u0000'
  }

  let s = text

  // 行内代码：内容整体转义后直接使用，不参与后续任何解析
  s = s.replace(/`([^`]+)`/g, (_, code) => keep('<code>' + escapeText(code) + '</code>'))

  // 原始 HTML：白名单直通；非白名单降级为文本（保留可见，不凭空消失）
  s = s.replace(TAG_RE, (tag) => {
    const safe = sanitizeTag(tag)
    return keep(safe === null ? escapeText(tag) : safe)
  })

  // 其余文本转义
  s = escapeText(s)

  // 图片（放链接前，避免 `![alt](src)` 被链接规则吃掉）
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
    const url = normalizeUrl(src)
    if (!url) return alt
    return '<img src="' + attrValue(url) + '" alt="' + attrValue(alt) + '" />'
  })

  // 链接：外链新窗口，站内链接同窗口（否则点「更新记录」会白开一个标签）
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    const url = normalizeUrl(href)
    if (!url) return label
    const external = /^https?:\/\//i.test(url)
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return '<a href="' + attrValue(url) + '"' + attrs + '>' + label + '</a>'
  })

  // 粗体 → 斜体 → 删除线
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? '')
}

/** 块级 HTML 行：逐标签消毒，非白名单标签降级为文本 */
function renderHtmlBlock(line) {
  return line.replace(TAG_RE, (tag) => {
    const safe = sanitizeTag(tag)
    return safe === null ? escapeText(tag) : safe
  })
}

/* ============================ 块级解析 ============================ */

export function renderMarkdown(md) {
  if (!md) return ''
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n')
  const out = []

  let listType = null // 'ul' | 'ol'
  let quoteBuf = []   // 连续引用行 → 一个 <blockquote>
  let paraBuf = []    // 连续普通行 → 一个 <p>（行间软换行渲染成 <br />）
  let tableBuf = []

  const closeList = () => {
    if (listType) { out.push('</' + listType + '>'); listType = null }
  }
  const openList = (t) => {
    if (listType === t) return
    closeList()
    out.push('<' + t + '>')
    listType = t
  }
  const flushQuote = () => {
    if (!quoteBuf.length) return
    out.push('<blockquote>' + quoteBuf.map((l) => inline(l)).join('<br />') + '</blockquote>')
    quoteBuf = []
  }
  const flushPara = () => {
    if (!paraBuf.length) return
    out.push('<p>' + paraBuf.map((l) => inline(l)).join('<br />') + '</p>')
    paraBuf = []
  }
  const flushTable = () => {
    if (!tableBuf.length) return
    const rows = tableBuf
    tableBuf = []
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const head = cells(rows[0])
    const body = rows.slice(2).map(cells) // rows[1] 是 |---|---| 分隔行
    let html = '<table><thead><tr>'
    head.forEach((h) => { html += '<th>' + inline(h) + '</th>' })
    html += '</tr></thead><tbody>'
    body.forEach((r) => {
      html += '<tr>'
      r.forEach((c) => { html += '<td>' + inline(c) + '</td>' })
      html += '</tr>'
    })
    html += '</tbody></table>'
    out.push(html)
  }
  /** 遇到任何块级边界时统一收口 */
  const flushBlocks = () => { flushTable(); flushQuote(); flushPara(); closeList() }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].replace(/\s+$/, '') // 尾随空格只作硬换行提示，不进内容
    const trimmed = line.trim()

    // ---- 围栏代码块 ----
    if (/^```/.test(trimmed)) {
      flushBlocks()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++
      out.push('<pre><code>' + escapeText(buf.join('\n')) + '</code></pre>')
      continue
    }

    // ---- 表格（本行以 | 开头且下一行是分隔行）----
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushQuote(); flushPara(); closeList()
      tableBuf.push(line)
      i++
      while (i < lines.length && /^\s*\|/.test(lines[i])) { tableBuf.push(lines[i].replace(/\s+$/, '')); i++ }
      flushTable()
      continue
    }

    // ---- 块级 HTML（整行都是标签，如 README 里的打赏二维码 div）----
    if (trimmed.startsWith('<') && BLOCK_HTML_RE.test(trimmed)) {
      flushBlocks()
      out.push(renderHtmlBlock(trimmed))
      i++
      continue
    }

    // ---- 标题 ----
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      flushBlocks()
      const lv = h[1].length
      out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>')
      i++
      continue
    }

    // ---- 分割线 ----
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushBlocks()
      out.push('<hr />')
      i++
      continue
    }

    // ---- 引用块 ----
    const q = /^>\s?(.*)$/.exec(line)
    if (q) {
      flushTable(); flushPara(); closeList()
      quoteBuf.push(q[1])
      i++
      continue
    }
    flushQuote()

    // ---- 无序列表 ----
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (ul) {
      flushPara()
      openList('ul')
      out.push('<li>' + inline(ul[1]) + '</li>')
      i++
      continue
    }

    // ---- 有序列表 ----
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ol) {
      flushPara()
      openList('ol')
      out.push('<li>' + inline(ol[1]) + '</li>')
      i++
      continue
    }
    closeList()

    // ---- 空行 ----
    if (!trimmed) { flushQuote(); flushPara(); i++; continue }

    // ---- 普通段落 ----
    flushTable()
    paraBuf.push(line)
    i++
  }

  flushBlocks()
  // 兜底：万一有占位符没被还原，别把 \u0000 漏进 HTML
  return out.join('\n').replace(/\u0000\d*\u0000?/g, '')
}
