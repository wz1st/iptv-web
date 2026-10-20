<script setup>
// 在线升级 —— 管理系统（api + 前端整包）与引擎两条链路，各自「检测 → 确认下载 → 确认升级」。
// 前端(webdist)随管理系统同一发布标签发布，更新管理系统时一并更新，不再独立检查。
import { ref, onMounted } from 'vue'
import { post } from '@/api/http'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API } from '@/api/endpoints'
import { markUpgradeStarted } from '@/utils/upgrade'

const version = ref('')       // 管理系统（api，与前端同版本号）
const engineVersion = ref('') // 引擎
const loading = ref(true)

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
  const ep = KINDS[kind]
  try {
    const check = await post(ep.check)
    if (check?.code === 2) {
      notify(check.msg || '当前已是最新版本', 'success', 3000)
      return
    }
    if (check?.code !== 1) {
      // 跨大版本/大改动、发布不完整（缺前端整包）：后端回的是一句「请更新镜像」，弹完就结束。
      notify(check?.msg || '检查更新失败', check?.type || 'danger', 4000)
      return
    }
    if (!(await confirm(`${check.msg}，是否下载？`, { okText: '确认', okVariant: 'danger' }))) return

    notify('更新下载中', 'info', 1200)
    const down = await post(ep.down)
    // code 2 = 发布位里没有合格的新版本（检测通过、下载时被跳过，例如只剩脏发布）。
    // 这不是故障，按"已是最新"提示，别用 danger 吓人。
    if (down?.code === 2) {
      notify(down.msg || '当前已是最新版本', 'success', 3000)
      return
    }
    if (down?.code !== 1) {
      notify(down?.msg || '下载失败', 'danger', 3000)
      return
    }
    if (!(await confirm(`${down.msg} 下载完成，是否升级？`, { okText: '确认', okVariant: 'danger' }))) return

    // 点下"确认升级"的这一刻就上遮罩，不等服务端回话：接下来 api 进程会被
    // 启动器重启，请求本来就要失败/超时，等回话等于让用户盯着空屏。
    // 遮罩之后由 /api/updata/status 轮询接管，直到完成或失败才撤。
    markUpgradeStarted(kind)
    const up = await post(API.adminUpdata)
    notify(up?.msg || '已触发更新', up?.type || 'info', 3000)
  } catch {
    notify(`${ep.name}更新操作失败`, 'danger', 1500)
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
          <button class="ui-btn ui-btn--primary" type="button" @click="runUpgrade('web')">检测更新</button>
        </div>
      </div>
    </div>

    <div class="ui-card u-mt-16">
      <div class="ui-card__header"><h4>引擎更新</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <span class="ui-field__label" style="margin: 0">当前版本:</span>
          <span class="ui-kv"><span class="ui-kv__v ui-kv__v--mono">{{ loading ? '读取中…' : (engineVersion || '-') }}</span></span>
          <button class="ui-btn ui-btn--primary" type="button" @click="runUpgrade('engine')">检测更新</button>
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
