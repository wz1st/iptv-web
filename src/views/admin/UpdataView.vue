<script setup>
// 在线升级 —— 管理系统（api + 前端整包）与引擎两条链路，各自「检测 → 确认下载 → 确认升级」。
// 前端(webdist)随管理系统同一发布标签发布，更新管理系统时一并更新，不再独立检查。
import { ref, onMounted } from 'vue'
import { post } from '@/api/http'
import { notify } from '@/utils/feedback'
import { confirm, notifyBox } from '@/utils/confirm'
import { API } from '@/api/endpoints'
import { markUpgradeStarted, abortUpgrade } from '@/utils/upgrade'
import { startDownload, stopDownload } from '@/utils/download'

const version = ref('')       // 管理系统（api，与前端同版本号)
const engineVersion = ref('') // 引擎
const loading = ref(true)
const busyKind = ref('')      // 正在走「检测→下载→升级」哪条链路：'' / 'web' / 'engine'

// 升级链路上的失败一律弹窗，不走右下角自动关闭的 toast。
//
// 理由很实际：这一步失败之后**没有后续动作**了 —— 用户不点重试就只能干等着，
// 而 toast 3~6 秒就消失，等他反应过来读到时已经没了。下载失败尤其致命：
// 30MB 下到一半失败，用户既不知道下了多少，也不知道该不该重下。
// 成功/进行中的提示仍然用 toast：那些场景用户本来就有事要做（点确认、等着）。
async function failBox(title, msg) {
  await notifyBox(msg, { title, okText: '知道了', okVariant: 'danger' })
}

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminUpdataData)
    version.value = res?.version || ''
    engineVersion.value = res?.engine || ''
  } catch {
    version.value = ''
    engineVersion.value = ''
  }
  loading.value = false
}
onMounted(load)

// 两条链路结构完全一样，只有「端点 + 被升级的对象名」不同。
const KINDS = {
  web: { check: API.adminUpdataCheckWeb, down: API.adminUpdataDownWeb, name: '管理系统与前端' },
  engine: { check: API.adminUpdataCheckEngine, down: API.adminUpdataDownEngine, name: '引擎' },
}

async function runUpgrade(kind) {
  if (busyKind.value) return
  const ep = KINDS[kind]
  busyKind.value = kind
  try {
    const check = await post(ep.check)
    if (check?.code === 2) {
      notify(check.msg || '当前已是最新版本', 'success', 3000)
      return
    }
    if (check?.code !== 1) {
      // 跨大版本/大改动、发布不完整（缺前端整包）：后端回的是一句「请更新镜像」。
      // 这一步失败用户没有任何后续动作 ⇒ 弹窗，不让他错过。
      await failBox(`${ep.name}更新`, check?.msg || '检查更新失败')
      return
    }
    if (!(await confirm(`${check.msg}，是否下载？`, { okText: '确认', okVariant: 'danger' }))) return

    // 下载期间上全屏遮罩 + 实时进度。
    //
    // 这一步是**一次普通的同步 HTTP 请求** —— 它返回就是下载完了，它抛错就是
    // 下载失败了。所以遮罩的边界完全由这个 promise 决定，不需要去问服务端
    // "现在到底在不在下载"（那正是升级遮罩的判据，两套别混）。
    //
    // 30MB 的包在慢网络下要下好几分钟，期间不给任何反馈，用户只能对着一个
    // 不动的按钮猜是不是卡死了。
    startDownload(kind)
    let down
    try {
      down = await post(ep.down)
    } finally {
      // 三条路径（成功 / code≠1 / 抛错）都要撤遮罩。stopDownload 幂等。
      stopDownload()
    }
    // code 2 = 发布位里没有合格的新版本（检测通过、下载时被跳过，例如只剩脏发布）。
    // 这不是故障，按"已是最新"提示，别用 danger 吓人 —— 它是终态结论而不是
    // 需要重试的故障，toast 足够。
    if (down?.code === 2) {
      notify(down.msg || '当前已是最新版本', 'success', 3000)
      return
    }
    if (down?.code !== 1) {
      await failBox(`${ep.name}下载失败`, down?.msg || '下载失败，请检查网络或代理设置后重试')
      return
    }
    if (!(await confirm(`${down.msg} 下载完成，是否升级？`, { okText: '确认', okVariant: 'danger' }))) return

    // 点下"确认升级"的这一刻就上遮罩，不等服务端回话：接下来 api 进程会被
    // 启动器重启，请求本来就要失败/超时，等回话等于让用户盯着空屏。
    // 遮罩之后由 /api/updata/status 轮询接管，直到完成或失败才撤。
    markUpgradeStarted(kind)
    const up = await post(API.adminUpdata)
    if (up?.code !== 1) {
      // 触发升级本身失败：撤遮罩并弹窗说清，否则用户会盯着一块遮罩等到超时。
      abortUpgrade()
      await failBox(`${ep.name}升级未触发`, up?.msg || '升级未能触发，请重试')
    }
  } catch (e) {
    await failBox(`${ep.name}更新操作失败`, e?.message || '请求未能完成，请检查网络后重试')
  } finally {
    busyKind.value = ''
  }
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header"><h4>管理系统 / 前端更新</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <span class="ui-field__label" style="margin: 0">当前版本:</span>
          <span class="ui-kv"><span class="ui-kv__v ui-kv__v--mono">{{ loading ? '读取中…' : (version || '-') }}</span></span>
          <button
            class="ui-btn ui-btn--primary"
            type="button"
            :disabled="busyKind === 'web'"
            @click="runUpgrade('web')"
          >
            检测更新
            <span v-if="busyKind === 'web'" class="ui-btn__spinner" />
          </button>
        </div>
      </div>
    </div>

    <div class="ui-card u-mt-16">
      <div class="ui-card__header"><h4>引擎更新</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <span class="ui-field__label" style="margin: 0">当前版本:</span>
          <span class="ui-kv"><span class="ui-kv__v ui-kv__v--mono">{{ loading ? '读取中…' : (engineVersion || '-') }}</span></span>
          <button
            class="ui-btn ui-btn--primary"
            type="button"
            :disabled="busyKind === 'engine'"
            @click="runUpgrade('engine')"
          >
            检测更新
            <span v-if="busyKind === 'engine'" class="ui-btn__spinner" />
          </button>
        </div>
      </div>
    </div>

    <small class="ui-help">
      提示：检测到新版本后会依次询问「是否下载」「是否升级」，升级过程由后端异步执行，稍后刷新页面生效。
      管理系统与前端随同一发布版本更新，点「管理系统 / 前端更新」即一并处理，无需分别操作。
      只有小改动版本支持在线升级；跨大版本或大改动、或发布缺前端整包时请更新 Docker 镜像。
    </small>
  </div>
</template>
