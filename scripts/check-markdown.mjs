/* markdown 渲染器回归测试。 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderMarkdown } from '../src/utils/markdown.js'

const here = dirname(fileURLToPath(import.meta.url))

let pass = 0
let fail = 0

function it(name, fn) {
  try {
    fn()
    pass++
    console.log('  \u2713 ' + name)
  } catch (e) {
    fail++
    console.log('  \u2717 ' + name + '\n      ' + e.message)
  }
}

function need(html, needle, hint = '') {
  if (!html.includes(needle)) {
    throw new Error(
      `期望包含 ${JSON.stringify(needle)}${hint ? '（' + hint + '）' : ''}\n      实际输出: ${JSON.stringify(html)}`
    )
  }
}

function reject(html, needle) {
  if (html.includes(needle)) {
    throw new Error(`不应包含 ${JSON.stringify(needle)}\n      实际输出: ${JSON.stringify(html)}`)
  }
}

/** 块级标签之间的换行是排版用的，断言时不该被它们绊倒 */
function needNorm(html, needle) {
  const norm = (s) => s.replace(/>\s+</g, '><').trim()
  if (!norm(html).includes(norm(needle))) {
    throw new Error(`期望包含（忽略标签间空白）${JSON.stringify(needle)}\n      实际输出: ${JSON.stringify(html)}`)
  }
}

console.log('\n[1] 引用块（本次回归的核心）')

it('单行引用渲染为 <blockquote>', () => {
  const html = renderMarkdown('>如果觉得好用，请打赏支持一下')
  need(html, '<blockquote>')
  need(html, '如果觉得好用')
  need(html, '</blockquote>')
})

it('引用的 `>` 不会残留为字面量', () => {
  // 旧实现把 `>` 转义成 `&gt;` 后正则失配，整行原样吐出来
  const html = renderMarkdown('>引用内容')
  reject(html, '&gt;引用内容')
  reject(html, '&gt;引用')
})

it('连续引用行合并进同一个 blockquote，行间用 <br />', () => {
  const html = renderMarkdown('>第一行\n>第二行\n>第三行')
  need(html, '<blockquote>第一行<br />第二行<br />第三行</blockquote>')
})

it('空行切断引用块', () => {
  const html = renderMarkdown('>甲\n\n>乙')
  if ((html.match(/<blockquote>/g) || []).length !== 2) {
    throw new Error('应为两个独立 blockquote\n      实际: ' + html)
  }
})

console.log('\n[2] 字符引用与转义')

it('&nbsp; 原样保留（不被转成 &amp;nbsp;）', () => {
  const html = renderMarkdown('甲&nbsp;&nbsp;&nbsp;&nbsp;乙')
  need(html, '&nbsp;')
  reject(html, '&amp;nbsp;')
})

it('裸 & 会被转义', () => {
  need(renderMarkdown('A & B'), 'A &amp; B')
})

it('<script> 被转义成文本，不构成注入', () => {
  const html = renderMarkdown('<script>alert(1)</script>')
  need(html, '&lt;script&gt;')
  reject(html, '<script>')
})

it('非白名单标签降级为可见文本（不凭空消失）', () => {
  const html = renderMarkdown('端口 -p <port>:80 映射')
  need(html, '&lt;port&gt;', '否则 <port> 会整块蒸发')
})

console.log('\n[3] 原始 HTML 白名单')

it('README 的 QQ 群按钮 <a><img></a> 直通', () => {
  const html = renderMarkdown(
    '<a target="_blank" href="https://qm.qq.com/cgi-bin/qm/qr?k=abc&jump_from=webapi">' +
      '<img border="0" src="http://pub.idqqimg.com/wpa/images/group.png" alt="清和iptv" title="清和iptv"></a>'
  )
  need(html, '<a ')
  need(html, 'href="https://qm.qq.com/cgi-bin/qm/qr?k=abc&amp;jump_from=webapi"', '属性值里的 & 要转义')
  need(html, '<img ')
  need(html, 'src="http://pub.idqqimg.com/wpa/images/group.png"')
  need(html, 'alt="清和iptv"')
  need(html, 'rel="noopener noreferrer"', 'target=_blank 要自动补 rel')
  reject(html, '&lt;a ')
})

it('打赏二维码的 div 块级直通（class 走 .pay-qr，手机端靠 CSS 改上下分布）', () => {
  const html = renderMarkdown(
    '<div class="pay-qr" id="install-show">\n' +
      '  <img src="./static/images/wxpay.jpg" alt="微信" width="300">\n' +
      '</div>'
  )
  need(html, '<div class="pay-qr" id="install-show">')
  need(html, 'src="/static/images/wxpay.jpg"')
  need(html, 'width="300"')
  reject(html, '<p><div', 'div 不该被段落包裹（非法嵌套）')
})

it('on* 事件属性被剥离', () => {
  const html = renderMarkdown('<a href="https://a.com" onclick="alert(1)" onerror=alert>点</a>')
  need(html, '<a href="https://a.com">')
  reject(html, 'onclick')
  reject(html, 'onerror')
})

it('javascript: 协议被拦', () => {
  const html = renderMarkdown('<a href="javascript:alert(1)">点</a>')
  reject(html, 'javascript:')
})

it('协议探测绕过（`java<tab>script:`）也被拦', () => {
  // tab 会被浏览器从 URL 里剔除，`java\tscript:` 等价于 `javascript:`
  const html = renderMarkdown('<a href="java\tscript:alert(1)">点</a>')
  reject(html, 'script:alert')
})

it('HTML 字符引用绕过（`&#106;avascript:`）也被拦', () => {
  // 属性值里的字符引用在 HTML 解析阶段就会被还原成 javascript:
  const html = renderMarkdown('<a href="&#106;avascript:alert(1)">点</a>')
  reject(html, 'script:alert')
  reject(html, 'href=')
})

it('字符引用绕过 style（`express&#105;on`）也被拦', () => {
  const html = renderMarkdown('<div style="width:express&#105;on(alert(1))"></div>')
  reject(html, 'on(alert')
  need(html, '<div></div>')
})

it('style 里的 expression / @import 被剥离', () => {
  reject(renderMarkdown('<div style="width:expression(alert(1))">x</div>'), 'expression')
  reject(renderMarkdown('<div style="background:url(@import x)">x</div>'), '@import')
})

it('HTML 注释被丢弃', () => {
  reject(renderMarkdown('前<!-- 隐藏 -->后'), '隐藏')
})

it('行内代码里的 HTML 不被当标签', () => {
  const html = renderMarkdown('用 `<div>` 包起来')
  need(html, '<code>&lt;div&gt;</code>')
})

console.log('\n[4] 相对路径规范化')

it('README 的 ./ChangeLog.md 补前导斜杠', () => {
  // 否则在 /admin/about 下会被解析成 /admin/ChangeLog.md → 404
  need(renderMarkdown('[更新记录](./ChangeLog.md)'), 'href="/ChangeLog.md"')
})

it('图片相对路径同样规范化', () => {
  need(renderMarkdown('![](./static/images/zfbpay.jpg)'), 'src="/static/images/zfbpay.jpg"')
})

it('站内链接同窗口，外链新窗口', () => {
  need(renderMarkdown('[更新记录](./ChangeLog.md)'), '<a href="/ChangeLog.md">更新记录</a>')
  need(renderMarkdown('[博客](https://www.qingh.xyz/)'), 'target="_blank"')
})

console.log('\n[5] 其余语法的基本盘')

it('标题', () => {
  need(renderMarkdown('## 注意'), '<h2>注意</h2>')
  need(renderMarkdown('#### 2025-12-24 v3.0.2.0'), '<h4>2025-12-24 v3.0.2.0</h4>')
})

it('标题里的链接', () => {
  need(renderMarkdown('## [更新记录](./ChangeLog.md)'), '<h2><a href="/ChangeLog.md">更新记录</a></h2>')
})

it('无序列表', () => {
  needNorm(renderMarkdown('- 甲\n- 乙'), '<ul><li>甲</li><li>乙</li></ul>')
})

it('有序列表', () => {
  needNorm(renderMarkdown('1. 甲\n2. 乙'), '<ol><li>甲</li><li>乙</li></ol>')
})

it('列表项里的原始 HTML', () => {
  const html = renderMarkdown('- QQ群：952354546 <a href="https://qm.qq.com/x"><img src="http://a/b.png"></a>')
  need(html, '<li>')
  need(html, '<a href="https://qm.qq.com/x">')
  need(html, '<img src="http://a/b.png"')
})

it('围栏代码块保留内容并转义', () => {
  const html = renderMarkdown('```\ndocker run -p <port>:80\n```')
  need(html, '<pre><code>docker run -p &lt;port&gt;:80</code></pre>')
})

it('行内代码', () => {
  need(renderMarkdown('使用`DE=解码#SC=比例`参数'), '<code>DE=解码#SC=比例</code>')
})

it('粗体 / 斜体 / 删除线', () => {
  need(renderMarkdown('**粗**'), '<strong>粗</strong>')
  need(renderMarkdown('*请勿拦截auth.qingh.xyz域名访问*，拦截将无法激活'), '<em>请勿拦截auth.qingh.xyz域名访问</em>')
  need(renderMarkdown('~~删~~'), '<del>删</del>')
})

it('分割线', () => {
  need(renderMarkdown('---'), '<hr />')
})

it('表格', () => {
  const html = renderMarkdown('| 甲 | 乙 |\n|---|---|\n| 1 | 2 |')
  need(html, '<table>')
  need(html, '<th>甲</th>')
  need(html, '<td>2</td>')
})

it('段落内的连续行用 <br /> 连接', () => {
  need(renderMarkdown('第一行\n第二行'), '<p>第一行<br />第二行</p>')
})

console.log('\n[6] 真实 README.md')

// 读不到就跳过：这节最有价值（盯的就是用户报的两个现象），但不该让
// 「只挂了 web/ 没挂仓库根」的构建环境变成红灯。
let readme = ''
try {
  readme = readFileSync(resolve(here, '../../README.md'), 'utf8')
} catch {
  console.log('  （跳过：读不到仓库根的 README.md）')
}

if (readme) {
  it('引用块渲染出来了', () => {
    const html = renderMarkdown(readme)
    need(html, '<blockquote>')
    need(html, '如果觉得好用，请打赏支持一下')
    need(html, '本程序仅供学习交流使用')
  })

  it('QQ 群按钮（内联 HTML）渲染出来了', () => {
    const html = renderMarkdown(readme)
    need(html, 'src="http://pub.idqqimg.com/wpa/images/group.png"')
    need(html, '&nbsp;')
  })

  it('打赏二维码（flex div）渲染出来了', () => {
    const html = renderMarkdown(readme)
    need(html, 'src="/static/images/wxpay.jpg"')
    need(html, 'src="/static/images/zfbpay.jpg"')
  })

  it('没有残留的未渲染源码块', () => {
    const html = renderMarkdown(readme)
    reject(html, '&lt;div style=', '内联 HTML 不该以文本形式出现')
    reject(html, '&lt;img ', '内联 img 不该以文本形式出现')
    reject(html, '&amp;nbsp;')
  })

  it('安装命令代码块未被破坏', () => {
    const html = renderMarkdown(readme)
    need(html, 'docker volume create iptv')
    need(html, 'docker pull v1st233/iptv:latest')
  })
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项\n`)
process.exit(fail === 0 ? 0 : 1)
