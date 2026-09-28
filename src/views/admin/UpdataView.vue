<script setup>
// 在线升级 —— 管理系统 / 前端 / 引擎三条链路，各自「检测 → 确认下载 → 确认升级」。
import { ref, onMounted } from 'vue'
import { post } from '@/api/http'
import { notify } from '@/utils/feedback'
import { confirm } from '@/utils/confirm'
import { API } from '@/api/endpoints'

const version = ref('')       // 管理系统（api）
const frontVersion = ref('')  // 前端（本页产物）
const engineVersion = ref('') // 引擎
const loading = ref(true)

// 只接受形如 v3.0.7 / 3.0.7 的串。构建时没传 APP_VERSION 会让占位符
const VER_RE = /^v?\d+(\.\d+)*$/

function readAppVersion() {
  const raw = document
    .querySelector('meta[name="app-version"]')
    ?.getAttribute('content') || ''
  const v = raw.trim()
  return VER_RE.test(v) ? v : ''
}

async function load() {
  loading.value = true
  frontVersion.value = readAppVersion()
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

// 三条链路结构完全一样，只有「端点 + 被升级的对象名 + 是否要自报版本」不同。
const KINDS = {
  web: { check: API.adminUpdataCheckWeb, down: API.adminUpdataDownWeb, name: '管理系统' },
  front: { check: API.adminUpdataCheckFront, down: API.adminUpdataDownFront, name: '前端' },
  engine: { check: API.adminUpdataCheckEngine, down: API.adminUpdataDownEngine, name: '引擎' },
}

async function runUpgrade(kind) {
  const ep = KINDS[kind]
  try {
    // 前端版本只有页面自己知道（后端没有这份记录），检测时一并报上去。
    const payload = kind === 'front' ? { version: frontVersion.value } : {}
    const check = await post(ep.check, payload)
    if (check?.code === 2) {
      notify(check.msg || '当前已是最新版本', 'success', 3000)
      return
    }
    if (check?.code !== 1) {
      // 跨大版本/大改动、发布里没带前端整包：后端回的是一句「请更新镜像」，弹完就结束。
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
      <div class="ui-card__header"><h4>管理系统更新</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <span class="ui-field__label" style="margin: 0">当前版本:</span>
          <span class="ui-kv"><span class="ui-kv__v ui-kv__v--mono">{{ loading ? '读取中…' : (version || '-') }}</span></span>
          <button class="ui-btn ui-btn--primary" type="button" @click="runUpgrade('web')">检测更新</button>
        </div>
      </div>
    </div>

    <div class="ui-card u-mt-16">
      <div class="ui-card__header"><h4>前端更新</h4></div>
      <div class="ui-card__body">
        <div class="ui-inline">
          <span class="ui-field__label" style="margin: 0">当前版本:</span>
          <span class="ui-kv"><span class="ui-kv__v ui-kv__v--mono">{{ loading ? '读取中…' : (frontVersion || '-') }}</span></span>
          <button class="ui-btn ui-btn--primary" type="button" @click="runUpgrade('front')">检测更新</button>
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
      前端版本号由构建时写入产物，若显示「-」请强制刷新页面，仍为空说明构建时没带版本号。
      只有小改动版本支持在线升级；跨大版本或大改动时请更新 Docker 镜像。
    </small>
  </div>
</template>
