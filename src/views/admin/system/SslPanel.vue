<script setup>
// SSL 证书 —— 系统菜单下的 HTTPS 配置页。
//
// 三块内容：
//   1) 开关：443（HTTPS）与「80 强制跳转」。开关一动就**立即保存**
//      （乐观更新 + 失败回滚，与后台其它开关一致）；保存时**刻意不带证书文本**，
//      所以翻转开关永远不会碰磁盘上的证书与私钥。
//   2) 证书与私钥：支持「选择文件」与「直接粘贴」两条路 —— 选择文件后由浏览器
//      把内容读进文本框，保存时统一发文本；两者固定落在 /config/cert（页面上有明示）。
//   3) 证书信息：主体 / 签发者 / 有效期 / 剩余天数 / 指纹 / 链长 / SAN，
//      以及私钥是否已配置、是否与证书配对。
import { ref, computed, onMounted } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitSwitch } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API, SSL_ROUTES } from '@/api/endpoints'
import AppSwitch from '@/components/AppSwitch.vue'

const data = ref(null)
const loading = ref(false)
const saving = ref(false)

// 表单只承载「会被提交」的东西。私钥框永远从空开始：服务端**故意不回显私钥**
// （它一旦进了浏览器就会留在历史与缓存里），要换私钥必须重新选文件或粘贴。
const form = ref({ enable: 0, forceRedirect: 0, certPem: '', keyPem: '' })
const certName = ref('')
const keyName = ref('')
const certPicker = ref(null)
const keyPicker = ref(null)

const info = computed(() => data.value?.cert || {})
const port = computed(() => Number(data.value?.port) || 443)
// 能不能开 HTTPS：证书解析得出来 + 私钥已配置。两样缺一个 nginx 都起不来。
const certReady = computed(() => !!info.value.ok && !!data.value?.keyConfigured)

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminSslData)
    data.value = res
    form.value.enable = res?.enable ? 1 : 0
    form.value.forceRedirect = res?.forceRedirect ? 1 : 0
    // 证书原文由服务端回填（公开信息），这样"只改开关"时文本框里还有内容
    form.value.certPem = res?.certPem || ''
    form.value.keyPem = ''
    certName.value = res?.certName || ''
    keyName.value = res?.keyName || ''
  } catch { /* 已统一提示 */ } finally {
    loading.value = false
  }
}
onMounted(load)

// ---- 开关 ----

// 开关请求体**只有开关与端口**：服务端把空的 certPem/keyPem 解释成
// "保持磁盘原样"，所以翻转开关不会重写证书文件。
function switchBody() {
  return {
    enable: form.value.enable === 1,
    forceRedirect: form.value.forceRedirect === 1,
    port: port.value,
  }
}

async function switchEnable(next) {
  if (next === 1 && !certReady.value) {
    form.value.enable = 0
    notify(
      info.value.ok
        ? '私钥还没配置好，请先上传或粘贴与证书配套的私钥，再开启 HTTPS'
        : '还没上传证书，请先上传或粘贴证书与私钥，再开启 HTTPS',
      'warning',
      4000,
    )
    return
  }
  const prev = form.value.enable
  form.value.enable = next
  const res = await submitSwitch(SSL_ROUTES.save, switchBody(), {
    revert: () => { form.value.enable = prev },
    successMsg: next === 1 ? 'HTTPS 已开启' : 'HTTPS 已关闭',
  })
  if (res?.code >= 1) await load()
}

async function switchRedirect(next) {
  const prev = form.value.forceRedirect
  form.value.forceRedirect = next
  const res = await submitSwitch(SSL_ROUTES.save, switchBody(), {
    revert: () => { form.value.forceRedirect = prev },
    successMsg: next === 1 ? '已开启 80 强制跳转' : '已关闭 80 强制跳转',
  })
  if (res?.code >= 1) await load()
}

// ---- 证书与私钥 ----

function pickCert() { certPicker.value?.click() }
function pickKey() { keyPicker.value?.click() }

// 读取本地文件并把内容填进对应文本框 —— "上传"与"粘贴"两条路最终都汇成一段文本，
// 保存时没有第二种格式要照顾。
async function readInto(file, which) {
  if (!file) return
  // 证书/私钥都是几 KB 的文本，超过 256 KB 基本可以断定选错了文件
  if (file.size > 256 * 1024) {
    notify('文件超过 256 KB —— 证书与私钥通常只有几 KB，请确认选对了文件', 'warning', 4000)
    return
  }
  let text = ''
  try {
    text = await file.text()
  } catch {
    notify('读取文件失败，请改用直接粘贴的方式', 'danger')
    return
  }
  if (!text.includes('-----BEGIN')) {
    notify('这个文件里没有 PEM 内容（缺少 -----BEGIN 行），请确认是 PEM 格式的证书/私钥', 'warning', 4000)
    return
  }
  if (which === 'cert') {
    form.value.certPem = text
    certName.value = file.name
  } else {
    form.value.keyPem = text
    keyName.value = file.name
  }
}

async function onCertFile(e) {
  await readInto(e.target.files?.[0], 'cert')
  e.target.value = '' // 允许连续选同一个文件
}

async function onKeyFile(e) {
  await readInto(e.target.files?.[0], 'key')
  e.target.value = ''
}

async function saveCert() {
  if (!form.value.certPem.trim()) {
    notify('请先选择证书文件或粘贴证书内容', 'warning')
    return
  }
  saving.value = true
  try {
    await submitAction(
      SSL_ROUTES.save,
      {
        enable: form.value.enable === 1,
        forceRedirect: form.value.forceRedirect === 1,
        port: port.value,
        certPem: form.value.certPem,
        keyPem: form.value.keyPem,
        certName: certName.value,
        keyName: keyName.value,
      },
      {
        // 保存成功后重新取数：证书信息、文件体积、开关的**收敛结果**
        // （HTTPS 关着时强制跳转会被服务端关掉）都以服务端为准。
        // 私钥框同时清空 —— 服务端不会把它回显出来。
        reload: async () => { form.value.keyPem = ''; await load() },
      },
    )
  } finally {
    saving.value = false
  }
}

async function clearCert() {
  const ok = await confirm(
    '确定清除已上传的证书与私钥吗？HTTPS 与「80 强制跳转」都会被关闭，站点将只能走 HTTP。',
    { okText: '清除' },
  )
  if (!ok) return
  saving.value = true
  try {
    await submitAction(SSL_ROUTES.clear, {}, {
      reload: async () => { form.value.keyPem = ''; await load() },
    })
  } finally {
    saving.value = false
  }
}

// ---- 展示用 ----

const daysText = computed(() => {
  const d = info.value
  if (!d?.ok) return ''
  if (d.expired) return `已过期 ${Math.abs(d.daysLeft)} 天`
  if (d.notYetValid) return '尚未生效'
  return `剩余 ${d.daysLeft} 天`
})

const daysTone = computed(() => {
  const d = info.value
  if (!d?.ok) return ''
  if (d.expired || d.notYetValid) return 'var(--c-danger)'
  if (d.expiringSoon) return 'var(--c-warning)'
  return ''
})

const keyState = computed(() => {
  if (!data.value?.keyConfigured) return { text: '未配置', tone: 'var(--c-warning)' }
  if (info.value.ok && !info.value.keyMatches) {
    return { text: '已配置，但与证书不是一对', tone: 'var(--c-danger)' }
  }
  if (!info.value.ok) return { text: '已配置（证书还没解析成功，无法校验）', tone: '' }
  return { text: '已配置，与证书匹配', tone: 'var(--c-success)' }
})

const sanText = computed(() => {
  const d = info.value
  if (!d?.ok) return ''
  const all = [...(d.dnsNames || []), ...(d.ipAddresses || [])]
  return all.length ? all.join('、') : '（证书里没有 SAN 字段，按 CN 匹配）'
})

// 证书/私钥的落点固定，页面上原样显示后端返回的路径（默认 /config/cert/...）
const certPath = computed(() => data.value?.certPath || '/config/cert/server.crt')
const keyPath = computed(() => data.value?.keyPath || '/config/cert/server.key')
const certDir = computed(() => data.value?.certDir || '/config/cert')
</script>

<template>
  <div>
    <div v-if="loading && !data" class="ui-card">
      <div class="ui-card__body">
        <div class="ui-alert ui-alert--info"><span class="ui-spinner" />正在读取证书与 HTTPS 状态…</div>
      </div>
    </div>

    <template v-else>
      <!-- 文件落点：用户最关心的就是"证书放哪了"，先说清楚 -->
      <div class="ui-alert ui-alert--info" style="margin-bottom: 16px">
        <div>
          <strong>证书与私钥保存在容器内的固定路径</strong>（宿主机上就是数据目录下挂载到
          <code>{{ certDir }}</code> 的 <code>cert/</code> 子目录）：
          <div style="margin-top: 4px">
            证书 → <code>{{ certPath }}</code>
          </div>
          <div>
            私钥 → <code>{{ keyPath }}</code>
          </div>
          <small class="ui-help">
            文件名固定，nginx 配置里写死的就是这两个路径。替换证书可以直接覆盖文件，也可以在本页
            重新上传或粘贴后保存；容器重建、重拉镜像都不会丢（在持久卷里）。
          </small>
        </div>
      </div>

      <div v-if="data?.warning" class="ui-alert ui-alert--warning" style="margin-bottom: 16px">
        {{ data.warning }}
      </div>

      <!-- 1) 开关 -->
      <div class="ui-card">
        <div class="ui-card__header"><h4>HTTPS 开关</h4></div>
        <div class="ui-card__body">
          <div class="ui-field" style="margin-bottom: 10px">
            <AppSwitch v-model="form.enable" @change="switchEnable">
              开启 HTTPS（监听 {{ port }} 端口）
            </AppSwitch>
            <small class="ui-help">
              开启后 nginx 同时监听 80 与 {{ port }}，两个端口访问的是同一个站点；
              APK 与浏览器走 HTTPS 就不会再出现"insecure connection"提示。
            </small>
          </div>

          <div class="ui-field" style="margin-bottom: 10px">
            <AppSwitch
              v-model="form.forceRedirect"
              :disabled="form.enable !== 1"
              @change="switchRedirect"
            >
              80 强制跳转到 HTTPS
            </AppSwitch>
            <small class="ui-help">
              打开后 80 端口的访问会 301 到 HTTPS（环回地址 127.0.0.1 例外，容器健康检查要用）。
              它从属于上面的 HTTPS 开关 —— HTTPS 关着时打开会把站点锁在门外，所以这里禁用了。
            </small>
          </div>

          <div class="ui-field" style="max-width: 420px; margin-bottom: 6px">
            <label class="ui-field__label">监听端口</label>
            <input class="ui-input" type="text" :value="port" disabled />
            <small class="ui-help">
              改端口要同时改 config.yml 与容器的端口映射（docker run -p 443:443 / compose 的
              ports），所以这里做成只读；默认 443。
            </small>
          </div>

          <small class="ui-help">
            nginx {{ data?.nginxVersion || '版本未知' }}<template v-if="data?.http2">，已启用 HTTP/2</template>
            ｜ 端口状态：{{ data?.listening ? '正在监听' : '未监听' }}
          </small>
        </div>
      </div>

      <!-- 2) 证书与私钥 -->
      <div class="ui-card">
        <div class="ui-card__header"><h4>证书与私钥</h4></div>
        <div class="ui-card__body">
          <div class="ui-field">
            <label class="ui-field__label">证书（PEM 文本）</label>
            <textarea
              v-model="form.certPem"
              class="ui-textarea"
              rows="7"
              spellcheck="false"
              placeholder="-----BEGIN CERTIFICATE-----"
            />
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <button class="ui-btn ui-btn--sm" type="button" @click="pickCert">选择证书文件…</button>
              <span v-if="certName" class="ui-help" style="margin-top: 0">来源：{{ certName }}</span>
            </div>
            <input
              ref="certPicker"
              type="file"
              style="display: none"
              accept=".crt,.cer,.pem,.txt"
              @change="onCertFile"
            />
          </div>

          <div class="ui-field">
            <label class="ui-field__label">私钥（PEM 文本）</label>
            <textarea
              v-model="form.keyPem"
              class="ui-textarea"
              rows="7"
              spellcheck="false"
              :placeholder="data?.keyConfigured
                ? '已经配置了私钥。留空表示保持不变；要更换请选择文件或粘贴新的私钥内容。'
                : '-----BEGIN PRIVATE KEY-----'"
            />
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <button class="ui-btn ui-btn--sm" type="button" @click="pickKey">选择私钥文件…</button>
              <span v-if="keyName" class="ui-help" style="margin-top: 0">来源：{{ keyName }}</span>
            </div>
            <input
              ref="keyPicker"
              type="file"
              style="display: none"
              accept=".key,.pem,.txt"
              @change="onKeyFile"
            />
            <small class="ui-help">
              两种方式都支持：<strong>选择文件</strong>（内容会自动填进上面的输入框）或<strong>直接粘贴</strong>。
              私钥出于安全考虑<strong>不会回显</strong>，框里留空表示保持服务器上已有的私钥不变。
            </small>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button class="ui-btn ui-btn--primary" type="button" :disabled="saving" @click="saveCert">
              保存证书与设置
            </button>
            <button
              class="ui-btn ui-btn--danger"
              type="button"
              :disabled="saving || (!info.ok && !data?.keyConfigured)"
              @click="clearCert"
            >
              清除证书
            </button>
          </div>
        </div>
      </div>

      <!-- 3) 证书信息 -->
      <div class="ui-card">
        <div class="ui-card__header"><h4>证书信息</h4></div>
        <div class="ui-card__body">
          <div v-if="!info.ok" class="ui-alert ui-alert--warning">
            {{ info.error || '还没有上传证书' }}
          </div>

          <template v-else>
            <div class="ui-table-wrap">
              <table class="ui-table ui-table--bordered">
                <tbody>
                  <tr>
                    <th style="width: 140px">主体</th>
                    <td>{{ info.subject }}</td>
                  </tr>
                  <tr>
                    <th>签发者</th>
                    <td>
                      {{ info.issuer }}
                      <template v-if="info.selfSigned">
                        <br />
                        <small class="ui-help">
                          自签证书：浏览器与播放器会提示"不受信任"，正式对外请换受信任 CA 签发的证书。
                        </small>
                      </template>
                    </td>
                  </tr>
                  <tr>
                    <th>有效期</th>
                    <td>
                      {{ info.notBefore }} ~ {{ info.notAfter }}
                      <strong :style="{ color: daysTone }">（{{ daysText }}）</strong>
                    </td>
                  </tr>
                  <tr>
                    <th>域名 / IP</th>
                    <td>{{ sanText }}</td>
                  </tr>
                  <tr>
                    <th>序列号</th>
                    <td>{{ info.serial }}</td>
                  </tr>
                  <tr>
                    <th>签名算法</th>
                    <td>{{ info.sigAlg }}</td>
                  </tr>
                  <tr>
                    <th>密钥</th>
                    <td>{{ info.keyType || '未知' }}</td>
                  </tr>
                  <tr>
                    <th>证书链</th>
                    <td>
                      {{ info.chainLen }} 张
                      <small v-if="info.chainLen < 2" class="ui-help">
                        （只有叶子证书。部分客户端要求带中间证书，收到"证书链不完整"就把它补进来）
                      </small>
                    </td>
                  </tr>
                  <tr>
                    <th>SHA-256 指纹</th>
                    <td style="word-break: break-all">{{ info.fingerprint }}</td>
                  </tr>
                  <tr>
                    <th>私钥</th>
                    <td>
                      <strong :style="{ color: keyState.tone }">{{ keyState.text }}</strong>
                      <small v-if="info.keyError" class="ui-help">{{ info.keyError }}</small>
                    </td>
                  </tr>
                  <tr>
                    <th>文件</th>
                    <td>
                      证书 {{ data?.certSize || '—' }}
                      <span v-if="data?.certModTime">（{{ data.certModTime }}）</span>
                      ／ 私钥 {{ data?.keySize || '—' }}
                      <span v-if="data?.keyModTime">（{{ data.keyModTime }}）</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
