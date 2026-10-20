<script setup>
// 出网代理设置 —— 系统菜单下的网络代理配置。
//
// 一份配置（协议/地址/端口/账密）配一个**作用范围**：EPG 更新、频道源更新、
// 在线升级、中转取流四项各自独立开关，谁需要谁勾。四项都关着等于没配代理。
//
// ## 保存前一定先测
//
// 代理配错的后果不是报错而是**静默失效**：填错端口，EPG 与频道源更新会各自
// 安静地失败，日志只有一行「请求失败」，用户在后台完全看不出问题。所以服务端
// 在落盘前会实测「连代理 + 访问 GitHub + 访问 Google」，不通过一律不存，并回话
// failType=dial（代理连不通）/ overseas（能连但出不去）—— 这两种处置完全不同，
// 页面照实分开显示。
//
// ## 口令不回显
//
// 与私钥同理：口令一旦回显就会留在浏览器历史与缓存里。服务端只回显
// 「是否已配置」，留空表示不改。
import { ref, computed, onMounted } from 'vue'
import { post } from '@/api/http'
import { loadingShow, loadingHide, notify } from '@/utils/feedback'
import { API, PROXY_ROUTES } from '@/api/endpoints'
import AppSwitch from '@/components/AppSwitch.vue'

const data = ref(null)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
// 最近一次测试/保存的结论，用于在页面上留一张"通过/不通过 + 原因"的卡片。
const lastTest = ref(null)

const form = ref({
  type: '', host: '', port: 0,
  authOn: 0, user: '', pwd: '', pwdSet: false,
  useEpg: 0, useSrc: 0, useUp: 1, useRelay: 0,
})

const TYPES = [
  { value: '', label: '无代理' },
  { value: 'socks5', label: 'SOCKS5 代理' },
  { value: 'http', label: 'HTTP 代理' },
]

// 中转这一项对全部授权账号开放（不限授权类型，服务端 relayAllowed 与
// 此处同源，取的是中转开关本身那把尺），但只支持 SOCKS5 ——
// 长连接经 HTTP 代理的 CONNECT 隧道很容易中途断，中转断流的表现是
// 「直播拉不动」，排查成本远高于一开始就不给选。
const relayAllowed = computed(() => !!data.value?.relayAllowed)
const relayUsable = computed(() => relayAllowed.value && form.value.type === 'socks5')
const proxyOn = computed(() => form.value.type !== '')
const scopeCount = computed(() =>
  ['useEpg', 'useSrc', 'useUp', 'useRelay'].filter((k) => form.value[k] === 1).length,
)

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminProxyData)
    data.value = res
    form.value.type = res?.type || ''
    form.value.host = res?.host || ''
    form.value.port = Number(res?.port) || 0
    form.value.authOn = Number(res?.authOn) || 0
    form.value.user = res?.user || ''
    // 口令永远不回显；这里只记住"服务器上有过一个"，供输入框给提示。
    form.value.pwdSet = !!(res?.authOn === 1 && res?.user && !res?.pwd)
    form.value.pwd = ''
    form.value.useEpg = Number(res?.useEpg) || 0
    form.value.useSrc = Number(res?.useSrc) || 0
    form.value.useUp = Number(res?.useUp) || 0
    form.value.useRelay = Number(res?.useRelay) || 0
  } catch { /* 已统一提示 */ } finally {
    loading.value = false
  }
}
onMounted(load)

// 提交体：只带服务端认识的字段，pwd 留空表示"不改口令"。
function body() {
  return {
    type: form.value.type,
    host: form.value.host,
    port: Number(form.value.port) || 0,
    authOn: form.value.authOn,
    user: form.value.authOn === 1 ? form.value.user : '',
    pwd: form.value.authOn === 1 ? form.value.pwd : '',
    useEpg: form.value.useEpg,
    useSrc: form.value.useSrc,
    useUp: form.value.useUp,
    useRelay: relayUsable.value ? form.value.useRelay : 0,
  }
}

// 把服务端的结论翻成页面上的话。failType 决定语气：连不通是「代理地址或
// 代理服务有问题」，出不去是「代理能连，但没解决访问境外的问题」。
function failHint(res) {
  const base = res?.msg || '代理测试不通过'
  if (res?.data?.failType === 'dial') {
    return `${base}（请核对地址、端口与协议；若是账号密码代理，请确认开关已打开且账密正确）`
  }
  if (res?.data?.failType === 'overseas') {
    return `${base}（代理本身通了，但它访问不了境外站点，换一个出口或换一个代理再试）`
  }
  return base
}

async function test() {
  testing.value = true
  loadingShow()
  try {
    const res = await post(PROXY_ROUTES.test, body())
    lastTest.value = {
      ok: !!res?.data?.ok,
      failType: res?.data?.failType || '',
      text: res?.data?.ok
        ? `连接测试通过${res?.data?.latencyMs ? `，连接耗时 ${res.data.latencyMs} 毫秒` : ''}`
        : failHint(res),
    }
    notify(lastTest.value.text, res?.data?.ok ? 'success' : 'danger', 3500)
  } catch {
    notify('测试失败，请检查代理地址是否可达', 'danger')
  } finally {
    loadingHide()
    testing.value = false
  }
}

async function save() {
  if (form.value.type && (!form.value.host.trim() || !(Number(form.value.port) > 0))) {
    notify('请先填写代理地址与端口', 'warning')
    return
  }
  saving.value = true
  loadingShow()
  try {
    const res = await post(PROXY_ROUTES.save, body())
    lastTest.value = res?.data?.ok === false
      ? { ok: false, failType: res?.data?.failType || '', text: failHint(res) }
      : { ok: true, failType: '', text: res?.msg || '代理配置已保存' }
    if (res?.code >= 1) {
      notify(res?.msg || '代理配置已保存', 'success')
      await load()
    } else {
      // 不通过时服务端**没有落盘**，页面保持用户刚填的内容，让他改完再存。
      notify(lastTest.value.text, 'danger', 5000)
    }
  } catch {
    notify('保存失败，请稍后重试', 'danger')
  } finally {
    loadingHide()
    saving.value = false
  }
}

// 协议从中转切走时把中转的勾去掉：留着会出现"勾着一个永远不生效的开关"。
function onTypeChange() {
  if (!relayUsable.value) form.value.useRelay = 0
  if (form.value.type === '') {
    form.value.authOn = 0
    form.value.user = ''
    form.value.pwd = ''
  }
}
</script>

<template>
  <div>
    <div v-if="loading && !data" class="ui-card">
      <div class="ui-card__body">
        <div class="ui-alert ui-alert--info"><span class="ui-spinner" />正在读取代理配置…</div>
      </div>
    </div>

    <template v-else>
      <div class="ui-alert ui-alert--info" style="margin-bottom: 16px">
        <div>
          <strong>代理只作用在下面勾选的功能上</strong>，没勾的一律直连。
          <small class="ui-help" style="display: block; margin-top: 4px">
            配置写在 config.yml 的 <code>out_proxy</code> 段（容器内 <code>/config/config.yml</code>）。
            保存前会实测「连代理 + 访问 GitHub + 访问 Google」，不通过不会写进配置。
          </small>
        </div>
      </div>

      <!-- 1) 协议与地址 -->
      <div class="ui-card">
        <div class="ui-card__header"><h4>代理地址</h4></div>
        <div class="ui-card__body">
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start">
            <div class="ui-field" style="width: 200px">
              <label class="ui-field__label">代理类型</label>
              <select v-model="form.type" class="ui-select" @change="onTypeChange">
                <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div class="ui-field" style="width: 280px">
              <label class="ui-field__label">代理地址</label>
              <input
                v-model="form.host"
                class="ui-input"
                :disabled="!proxyOn"
                placeholder="例如 127.0.0.1 或 10.10.0.8"
                spellcheck="false"
              />
              <small class="ui-help">可以带 scheme（socks5://…）或端口，会自动拆开。</small>
            </div>
            <div class="ui-field" style="width: 140px">
              <label class="ui-field__label">端口</label>
              <input
                v-model.number="form.port"
                class="ui-input"
                type="number"
                min="1"
                max="65535"
                :disabled="!proxyOn"
                placeholder="1080"
              />
            </div>
          </div>

          <!-- 2) 账号密码 -->
          <div class="ui-field" style="margin-top: 10px">
            <AppSwitch v-model="form.authOn" :disabled="!proxyOn">
              代理需要账号密码
            </AppSwitch>
            <small class="ui-help">
              打开后下面两项才生效。多数本地代理（ clash / v2ray 等）不需要账号密码。
            </small>
          </div>
          <div v-if="form.authOn === 1" style="display: flex; gap: 12px; flex-wrap: wrap">
            <div class="ui-field" style="width: 220px">
              <label class="ui-field__label">代理用户名</label>
              <input v-model="form.user" class="ui-input" placeholder="用户名" spellcheck="false" />
            </div>
            <div class="ui-field" style="width: 220px">
              <label class="ui-field__label">代理密码</label>
              <input
                v-model="form.pwd"
                class="ui-input"
                type="password"
                :placeholder="form.pwdSet ? '已配置，留空表示不修改' : '密码'"
                spellcheck="false"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 3) 作用范围 -->
      <div class="ui-card">
        <div class="ui-card__header"><h4>作用范围</h4></div>
        <div class="ui-card__body">
          <div class="ui-field" style="margin-bottom: 8px">
            <AppSwitch v-model="form.useEpg" :disabled="!proxyOn">EPG 更新</AppSwitch>
            <small class="ui-help">定时任务与手动「更新全部」抓取 EPG 源时走代理。</small>
          </div>
          <div class="ui-field" style="margin-bottom: 8px">
            <AppSwitch v-model="form.useSrc" :disabled="!proxyOn">频道源更新</AppSwitch>
            <small class="ui-help">定时更新、手动更新列表、新增频道源时的抓取走代理。</small>
          </div>
          <div class="ui-field" style="margin-bottom: 8px">
            <AppSwitch v-model="form.useUp" :disabled="!proxyOn">在线升级</AppSwitch>
            <small class="ui-help">检查更新与下载升级包走代理（访问 GitHub）。默认勾选。</small>
          </div>
          <div class="ui-field" style="margin-bottom: 8px">
            <AppSwitch v-model="form.useRelay" :disabled="!relayUsable">中转取流</AppSwitch>
            <small class="ui-help">
              <template v-if="!relayAllowed">仅授权账号可用。</template>
              <template v-else-if="form.type !== 'socks5'">中转取流只支持 SOCKS5 代理，请先把类型改成 SOCKS5。</template>
              <template v-else>服务器替播放器取流时经 SOCKS5 代理连源站。</template>
            </small>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px">
            <button class="ui-btn ui-btn--primary" type="button" :disabled="saving || testing" @click="save">
              保存配置
            </button>
            <button class="ui-btn" type="button" :disabled="saving || testing" @click="test">
              只测试连接
            </button>
            <span v-if="proxyOn" class="ui-help" style="margin-top: 0">
              已启用 {{ scopeCount }} 项功能走代理
            </span>
          </div>
        </div>
      </div>

      <!-- 4) 最近一次测试结论 -->
      <div v-if="lastTest" class="ui-card">
        <div class="ui-card__header"><h4>连通性测试</h4></div>
        <div class="ui-card__body">
          <div
            class="ui-alert"
            :class="lastTest.ok ? 'ui-alert--success' : 'ui-alert--danger'"
          >
            <strong v-if="lastTest.ok">通过</strong>
            <strong v-else>不通过</strong>
            ：{{ lastTest.text }}
          </div>
          <small class="ui-help" style="margin-top: 8px; display: block">
            测试会依次做三件事：连一下代理服务器、用它访问 GitHub、用它访问 Google。
            「连不上代理」和「代理能连但访问不了境外」是两回事 —— 前者要核对地址端口，
            后者说明这个代理只是个国内出口。
          </small>
        </div>
      </div>
    </template>
  </div>
</template>
