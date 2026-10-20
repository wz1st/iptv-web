<script setup>
// 出网代理设置 —— 系统菜单下的网络代理配置。
//
// ## 两件事，两条提交路径
//
// 页面上这两块的风险等级完全不同，所以拆成互不干扰的两次提交：
//
//   - 左「代理地址」：协议/地址/端口/账密。填错的后果不是报错而是**静默失效**
//     （EPG、更新、下载各自安静地失败，日志只有一行「请求失败」），所以服务端
//     在落盘前会实测「连代理 + 访问 GitHub + 访问 Google」，不通过一律不存，
//     并回话 failType=dial（代理连不通）/ overseas（能连但出不去）。
//   - 右「作用范围」：四个开关各自即时提交，不跟「保存配置」捆绑 ——
//     拨开关就想看到结果，还要再点一次保存才生效，是把一次操作变成两步。
//
// ## 无代理（协议选"无代理"）
//
// 不清空地址与端口（下次启用不用重填），**跳过测试流程直接落盘**，并把四个
// 作用范围一并关闭：没配代理却勾着"走代理"，运行时表现是静默直连，
// 和"配了但坏了"无法区分。
//
// ## 口令不回显
//
// 与私钥同理：口令一旦回显就会留在浏览器历史与缓存里。服务端只回显
// 「是否已配置」，留空表示不改。
//
// ## 反馈方式：右下角提示 vs 弹窗
//
//   - 主动点「测试代理」⇒ **只弹右下角提示**，不弹窗。测试是用户自己想
//     知道结果，不该用模态框把页面锁住。
//   - 点「保存配置」且保存成功 ⇒ 同样只弹右下角提示。
//   - 点「保存配置」但**测试没通过、没落盘** ⇒ 弹一个**可主动关闭**的弹窗，
//     因为这时候需要用户做一个决定：要不要强制保存。
//     只有「代理能连上、但访问不了境外」（overseas）才给「强制保存」这个出口；
//     「连不上代理」（dial）不给 —— 那份配置存下去必然是坏的，
//     运行时的表现是各类抓取静默失败，比压根没配更难排查。
//
// ## 测过就不用再测
//
// 点「测试代理」通过后，服务端会发一张凭据（testToken）回来，它记着
// "这份配置刚测过、结论是通过"。接着点「保存配置」时带着它，
// 服务端核对配置（协议/地址/端口/账号开关/用户名/口令）**一个字都没改过**
// 才免掉那次重复的外网探测；改过任何一项就作废，老老实实重测一遍。
import { ref, computed, onMounted, watch } from 'vue'
import { post } from '@/api/http'
import { loadingShow, loadingHide, notify } from '@/utils/feedback'
import { API, PROXY_ROUTES } from '@/api/endpoints'
import AppSwitch from '@/components/AppSwitch.vue'
import AppModal from '@/components/AppModal.vue'

const data = ref(null)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
// 正在单独提交的作用范围开关 key，避免拨动过程中重复发请求。
const scopeBusy = ref('')

// 「测试代理」通过后服务端给的凭据：带着它保存，服务端就不必再测一遍。
const testToken = ref('')
// 测的时候这份配置长什么样（前端侧快照）。改动任一项就把凭据丢掉 ——
// 服务端那边还会按配置指纹再核一遍，这里只是少发一个必然作废的凭据。
const testedSig = ref('')
// 保存失败（测试没过）时的弹窗内容。
const failDialog = ref({
  visible: false,
  failType: '',
  text: '',
  canForce: false,
  token: '',
  busy: false,
})

const form = ref({
  type: '', host: '', port: 0,
  authOn: 0, user: '', pwd: '', pwdSet: false,
  useEpg: 0, useSrc: 0, useUp: 1, useRelay: 0,
})

// 协议做成三个单选框而不是下拉：只有三个选项且互斥，下拉要多点一次才能看清
// 有哪些选择；单选框一眼看全，且"无代理"这个最该被看到的选项排在最前。
const TYPES = [
  { value: '', label: '无代理', hint: '全部功能直连' },
  { value: 'socks5', label: 'SOCKS5', hint: 'v2ray / Shadowrocket' },
  { value: 'http', label: 'HTTP', hint: 'Clash / Privoxy' },
]

// 四个作用范围：key 与后端 dto.OutProxyScopeDto.Key 逐字对齐。
const SCOPES = [
  { key: 'useEpg', label: 'EPG 更新', desc: '定时任务与手动「更新全部」抓取 EPG 源时走代理。' },
  { key: 'useSrc', label: '频道源更新', desc: '定时更新、手动更新列表、新增频道源时的抓取走代理。' },
  { key: 'useUp', label: '在线升级', desc: '检查更新与下载升级包走代理（访问 GitHub）。' },
  { key: 'useRelay', label: '中转取流', desc: '服务器替播放器取流时经代理连源站（仅 SOCKS5）。' },
]

// 中转这一项对全部授权账号开放（不限授权类型，服务端 relayAllowed 与
// 此处同源，取的是中转开关本身那把尺），但只支持 SOCKS5 ——
// 长连接经 HTTP 代理的 CONNECT 隧道很容易中途断，中转断流的表现是
// 「直播拉不动」，排查成本远高于一开始就不给选。
const relayAllowed = computed(() => !!data.value?.relayAllowed)
const proxyOn = computed(() => form.value.type !== '')

// savedType 是**服务端已保存**的协议，不是表单里当前选中的那个。
// 开关能不能拨，看的是"服务器上到底有没有一个能用的代理" —— 在表单里
// 勾了 SOCKS5 但还没点保存时，服务器上仍然是空的，此时拨开关只会得到
// "看着生效、实际静默直连"的状态，那比直接不让拨更难排查。
const savedType = ref('')
const savedProxyOn = computed(() => savedType.value !== '' && savedType.value !== 'none')
const savedRelayUsable = computed(() => relayAllowed.value && savedType.value === 'socks5')

// 某个作用范围开关此刻能不能拨。中转另加"必须是 SOCKS5"。
function scopeDisabled(key) {
  if (scopeBusy.value === key) return true
  if (key === 'useRelay') return !savedRelayUsable.value
  return !savedProxyOn.value
}
const scopeCount = computed(() => SCOPES.filter((s) => form.value[s.key] === 1).length)

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminProxyData)
    data.value = res
    savedType.value = res?.type || ''
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

// 配置指纹（前端侧）：测完之后任何一项变了，凭据就作废。
function configSig() {
  const f = form.value
  return [f.type, f.host, f.port, f.authOn, f.user, f.pwd].join('')
}

// 改了就作废：地址/端口/账号/协议动过，之前那次测试的结论不再作数。
// （服务端还会按配置指纹再核一遍，这里只是别把一个必然作废的凭据发过去。）
watch(
  () => configSig(),
  (now) => {
    if (now !== testedSig.value) testToken.value = ''
  }
)

// 提交体：只带服务端认识的字段，pwd 留空表示"不改口令"。
// 刻意**不带**四个作用范围开关 —— 它们各自单独提交。
function body() {
  return {
    type: form.value.type,
    host: form.value.host,
    port: Number(form.value.port) || 0,
    authOn: form.value.authOn,
    user: form.value.authOn === 1 ? form.value.user : '',
    pwd: form.value.authOn === 1 ? form.value.pwd : '',
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

// 主动点「测试代理」：只右下角提示，不弹窗。
async function test() {
  if (!proxyOn.value) {
    notify('当前是无代理，无需测试', 'info', 2500)
    return
  }
  if (!form.value.host.trim() || !(Number(form.value.port) > 0)) {
    notify('请先填写代理地址与端口', 'warning')
    return
  }
  testing.value = true
  loadingShow()
  try {
    const res = await post(PROXY_ROUTES.test, body())
    const ok = !!res?.data?.ok
    if (ok) {
      // 记下凭据：接下来点保存时，服务端可以免掉重复的外网探测。
      testToken.value = res?.data?.testToken || ''
      testedSig.value = configSig()
    }
    notify(
      ok
        ? `连接测试通过${res?.data?.latencyMs ? `，连接耗时 ${res.data.latencyMs} 毫秒` : ''}`
        : failHint(res),
      ok ? 'success' : 'danger',
      ok ? 3000 : 5000,
    )
  } catch {
    notify('测试失败，请检查代理地址是否可达', 'danger')
  } finally {
    loadingHide()
    testing.value = false
  }
}

// 点「保存配置」。成功 ⇒ 只右下角提示；测试没过 ⇒ 弹可关闭的弹窗，
// 由用户决定要不要强制保存。
async function save(force = false) {
  // 有代理才校验地址；无代理直落盘（服务端也不测）。
  if (proxyOn.value && (!form.value.host.trim() || !(Number(form.value.port) > 0))) {
    notify('请先填写代理地址与端口', 'warning')
    return
  }
  saving.value = true
  failDialog.value.busy = true
  loadingShow()
  try {
    const res = await post(PROXY_ROUTES.save, {
      ...body(),
      force: force ? 1 : 0,
      // 强制保存时要把「失败结论」那张凭据带上，服务端才知道
      // 强存的依据是它实测到的 overseas 失败（而不是重新测一遍）。
      testToken: failDialog.value.token || testToken.value || '',
    })
    if (res?.code >= 1) {
      failDialog.value.visible = false
      notify(res?.msg || '代理配置已保存', res?.type === 'warning' ? 'warning' : 'success', 3500)
      // 存完这份配置就没必要再留着旧凭据了。
      testToken.value = ''
      testedSig.value = ''
      await load()
    } else {
      // 不通过时服务端**没有落盘**，页面保持用户刚填的内容，让他改完再存。
      // 这次失败也可能是"上次测的时候通了、现在通了"之外的原因，
      // 所以失败凭据要单独记，别和成功那张混。
      testToken.value = ''
      testedSig.value = ''
      const failType = res?.data?.failType || ''
      // 只有「能连上但出不去境外」才有强制保存的出口；
      // 其它失败（比如连不上代理）直接给结论，不给强存按钮。
      failDialog.value = {
        visible: true,
        failType,
        text: failHint(res),
        canForce: !!res?.data?.canForce,
        token: res?.data?.testToken || '',
        busy: false,
      }
    }
  } catch {
    notify('保存失败，请稍后重试', 'danger')
  } finally {
    loadingHide()
    saving.value = false
    failDialog.value.busy = false
  }
}

// 弹窗里的「强制保存」：用户已经看过失败结论并明确坚持。
function forceSave() {
  save(true)
}

// 每个作用范围开关各自即时提交：拨完立刻生效，不需要再点「保存配置」。
// 失败时把开关拨回服务端的值 —— 让界面回到"与服务器一致"，而不是
// 停在一个看着已生效、实际没生效的状态。
async function toggleScope(key, next) {
  if (scopeBusy.value) return
  if (next === 1 && !savedProxyOn.value) {
    notify('还没有配置代理类型，请先在左侧保存协议、地址与端口', 'warning', 4000)
    return
  }
  if (key === 'useRelay' && next === 1 && !savedRelayUsable.value) {
    notify('中转取流只支持 SOCKS5 代理，请先保存 SOCKS5 类型的代理配置', 'warning', 4000)
    return
  }
  const prev = form.value[key]
  scopeBusy.value = key
  try {
    const res = await post(PROXY_ROUTES.scope, { key, value: next ? 1 : 0 })
    if (res?.code >= 1) {
      form.value[key] = next ? 1 : 0
    } else {
      form.value[key] = prev
      notify(res?.msg || '开关保存失败', 'danger', 4000)
    }
  } catch {
    form.value[key] = prev
    notify('开关保存失败，请稍后重试', 'danger')
  } finally {
    scopeBusy.value = ''
  }
}

// 协议从中转切走时把中转的勾去掉：留着会出现"勾着一个永远不生效的开关"。
// 无代理时保留地址与端口（不清空），只把账密开关收起来。
function onTypeChange() {
  // 服务端存的不是 SOCKS5 时，中转勾选没有意义（界面也会禁用），直接清掉。
  if (!savedRelayUsable.value) form.value.useRelay = 0
  if (form.value.type === '') form.value.authOn = 0
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
          <strong>代理只作用在右边勾选的功能上</strong>，没勾的一律直连。
          <small class="ui-help" style="display: block; margin-top: 4px">
            配置写在 config.yml 的 <code>out_proxy</code> 段（容器内 <code>/config/config.yml</code>）。
            保存代理地址前会实测「连代理 + 访问 GitHub + 访问 Google」，不通过不会写进配置；
            刚点过「测试代理」且配置没动过时，保存不再重复测一遍。
            右边四个开关则是拨一下就单独生效。
          </small>
        </div>
      </div>

      <!-- 两张卡片左右并排：左边是"配什么代理"，右边是"给谁用"。
           窄屏自动回落成上下排列（grid 的 auto-fit + minmax）。
           ★ 必须带 ui-grid：全局样式 `.ui-card + .ui-card { margin-top:16px }`
           会让**第二张卡整体下沉 16px**（表现为"两卡顶部没对齐"），
           项目里只对 .ui-grid 清了零。 -->
      <div class="ui-grid proxy-grid">
        <!-- 1) 代理地址（含两个按钮） -->
        <div class="ui-card">
          <div class="ui-card__header"><h4>代理地址</h4></div>
          <div class="ui-card__body">
            <!-- 协议：三个单选框独占一行（原来挤在地址左边，得点开下拉才知道有哪些） -->
            <div class="ui-field" style="margin-bottom: 12px">
              <label class="ui-field__label">代理类型</label>
              <div class="proxy-types">
                <label
                  v-for="t in TYPES"
                  :key="t.value"
                  class="proxy-type"
                  :class="{ 'proxy-type--on': form.type === t.value }"
                >
                  <input
                    v-model="form.type"
                    type="radio"
                    name="proxy-type"
                    :value="t.value"
                    class="proxy-type__radio"
                    @change="onTypeChange"
                  >
                  <span class="proxy-type__body">
                    <span class="proxy-type__label">{{ t.label }}</span>
                    <span class="proxy-type__hint">{{ t.hint }}</span>
                  </span>
                </label>
              </div>
            </div>

            <!-- 地址与端口同一行 -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start">
              <div class="ui-field" style="flex: 1 1 220px">
                <label class="ui-field__label">代理地址</label>
                <input
                  v-model="form.host"
                  class="ui-input"
                  placeholder="例如 127.0.0.1 或 10.10.0.8"
                  spellcheck="false"
                />
                <small class="ui-help">可以带 scheme（socks5://…）或端口，会自动拆开。</small>
              </div>
              <div class="ui-field" style="width: 120px">
                <label class="ui-field__label">端口</label>
                <input
                  v-model.number="form.port"
                  class="ui-input"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="1080"
                />
              </div>
            </div>

            <!-- 账号密码 -->
            <div class="ui-field" style="margin-top: 10px">
              <AppSwitch v-model="form.authOn" :disabled="!proxyOn">
                代理需要账号密码
              </AppSwitch>
              <small class="ui-help">
                打开后下面两项才生效。多数本地代理（ clash / v2ray 等）不需要账号密码。
              </small>
            </div>
            <div v-if="form.authOn === 1" style="display: flex; gap: 12px; flex-wrap: wrap">
              <div class="ui-field" style="flex: 1 1 180px">
                <label class="ui-field__label">代理用户名</label>
                <input v-model="form.user" class="ui-input" placeholder="用户名" spellcheck="false" />
              </div>
              <div class="ui-field" style="flex: 1 1 180px">
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

            <!-- 按钮放在代理地址卡片里：它操作的正是上面这些输入框。 -->
            <div class="proxy-actions">
              <button class="ui-btn ui-btn--primary" type="button" :disabled="saving || testing" @click="save(false)">
                保存配置
              </button>
              <button class="ui-btn" type="button" :disabled="saving || testing" @click="test()">
                测试代理
              </button>
              <span class="ui-help" style="margin-top: 0">
                {{ proxyOn ? '保存前会先做连通性测试（刚测过且配置未改则不重复测）' : '无代理：不测试，直接保存并关闭作用范围' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 2) 作用范围（四个开关各自即时提交） -->
        <div class="ui-card">
          <div class="ui-card__header"><h4>作用范围</h4></div>
          <div class="ui-card__body">
            <div
              v-for="(s, i) in SCOPES"
              :key="s.key"
              class="ui-field"
              :style="{ marginBottom: i === SCOPES.length - 1 ? '0' : '10px' }"
            >
              <AppSwitch
                :model-value="form[s.key]"
                :disabled="scopeDisabled(s.key)"
                @update:model-value="(v) => toggleScope(s.key, v)"
              >
                {{ s.label }}
              </AppSwitch>
              <small class="ui-help">
                <template v-if="s.key === 'useRelay' && !relayAllowed">仅授权账号可用。</template>
                <template v-else>{{ s.desc }}</template>
              </small>
            </div>

            <div class="ui-alert ui-alert--info" style="margin-top: 14px">
              <div>
                <span v-if="scopeBusy === 'useEpg' || scopeBusy === 'useSrc' || scopeBusy === 'useUp' || scopeBusy === 'useRelay'">
                  <span class="ui-spinner" />正在保存开关…
                </span>
                <span v-else>
                  已启用 <strong>{{ scopeCount }}</strong> 项功能走代理
                  <template v-if="!savedProxyOn">（保存代理协议与地址后，开关才可操作）</template>
                </span>
              </div>
              <small class="ui-help" style="display: block; margin-top: 4px">
                每个开关拨一下就单独生效，不需要再点「保存配置」；四个都可以关着
                （那就是暂时不用代理）。
              </small>
            </div>
          </div>
        </div>
      </div>

      <!-- 3) 保存失败（测试没通过）时的弹窗：可主动关闭，并按失败类型
           决定要不要给「强制保存」这个出口。 -->
      <AppModal
        v-model="failDialog.visible"
        title="代理配置未保存"
        size="lg"
      >
        <div class="ui-alert ui-alert--danger">
          <strong>不通过</strong>：{{ failDialog.text }}
        </div>
        <small class="ui-help" style="display: block; margin-top: 10px">
          测试会依次做三件事：连一下代理服务器、用它访问 GitHub、用它访问 Google。
          <template v-if="failDialog.failType === 'dial'">
            这次是**连不上代理**（地址、端口、协议或账密不对），这种配置存下去必然是坏的，
            因此不提供强制保存 —— 请先把它改对。
          </template>
          <template v-else-if="failDialog.failType === 'overseas'">
            这次是**代理能连上、但访问不了境外**。这种代理对只访问国内资源的用途仍然有用，
            你可以坚持保存（走代理的用途可能失败）；也可以换个出口或换个代理再试。
          </template>
          <template v-else>
            请根据上面的原因调整代理地址、端口或协议后重试。
          </template>
        </small>
        <template #footer>
          <button class="ui-btn" type="button" :disabled="failDialog.busy" @click="failDialog.visible = false">
            关闭
          </button>
          <button
            v-if="failDialog.canForce"
            class="ui-btn ui-btn--warning"
            type="button"
            :disabled="failDialog.busy"
            @click="forceSave"
          >
            强制保存
          </button>
        </template>
      </AppModal>
    </template>
  </div>
</template>

<style scoped>
/* 两张卡片左右并排；窄屏（放不下 2×320px）自动回落成上下排列。
   不用 align-items: start —— 那会让两张卡片各自按内容收缩、底部参差；
   默认的 stretch 让两卡**等高且顶部对齐**。 */
.proxy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
/* 卡片内部纵向铺开，配合上面的 stretch 把两卡拉到等高。 */
.proxy-grid > .ui-card {
  display: flex;
  flex-direction: column;
}
/* 再显式清一次相邻卡片的 margin-top：双保险，不依赖全局规则将来是否改动。 */
.proxy-grid > .ui-card + .ui-card {
  margin-top: 0;
}
.proxy-grid > .ui-card > .ui-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.proxy-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 14px;
}

/* 协议单选卡：三个横排。**不画浏览器默认的小圆圈** —— 三个等宽卡片
   已经把"这是一个单选组"说清楚了，再加一排圆圈只是噪音。
   选中态靠边框 + 底色 + 字重表达；原生 input 只留无障碍可达性
   （视觉隐藏但仍可聚焦、仍可用键盘选中）。 */
.proxy-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.proxy-type {
  position: relative;
  display: block;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  user-select: none;
  transition: border-color .15s ease, background .15s ease;
}
.proxy-type:hover {
  border-color: var(--foreground);
}
.proxy-type--on {
  border-color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 8%, transparent);
}
.proxy-type:focus-within {
  outline: 2px solid var(--foreground);
  outline-offset: 1px;
}
.proxy-type__radio {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  margin: 0;
  pointer-events: none;
}
.proxy-type__body {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}
.proxy-type__label {
  font-size: 13px;
  font-weight: 600;
}
.proxy-type__hint {
  font-size: 11.5px;
  color: var(--muted-foreground);
}
</style>
