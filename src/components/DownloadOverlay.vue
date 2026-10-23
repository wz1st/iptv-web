<script setup>
// 在线升级**下载期**遮罩 —— 全屏 + 实时进度。
//
// 与 UpgradeOverlay（升级期遮罩）分开的原因见 utils/download.js 的说明：
// 下载是"一次同步 HTTP 请求"，边界由那个请求的 promise 决定；升级是
// "api 进程会被重启"，边界只能由服务端状态决定。两者混在一起会出现
// "下载刚结束就弹『未能触发升级，请重试』"这种自相矛盾的话。
//
// 层级：3100。
//   - 要高于 .ui-loading-layer(2900)：下载期间其它请求会陆续失败，前端可能
//     顺手 loadingShow()，那个转圈不该浮在下载遮罩上面。
//   - 要低于 .ui-upgrade-mask(3200)：两者理论上不同时出现（下载完才轮得到
//     升级），留出余量免得将来出现叠罩时升级遮罩被压住。
import { computed } from 'vue'
import { downloadState } from '@/utils/download'

const d = downloadState()

const KIND_TEXT = {
  web: '管理系统与前端',
  engine: '引擎',
}
const kindText = computed(() => KIND_TEXT[d.kind] || '管理系统')

// 百分比夹在 0~100：服务端已经夹过一次，这里再夹是为了让 CSS width 永远合法
// （负数或 NaN 会让整条进度条消失，比显示错更让人困惑）。
const percent = computed(() => Math.max(0, Math.min(100, Number(d.percent) || 0)))
</script>

<template>
  <Teleport to="body">
    <div v-if="d.running" class="ui-upgrade-mask ui-download-mask" role="alertdialog" aria-live="polite">
      <div class="ui-upgrade-card">
        <div class="ui-spinner" />
        <h4 class="ui-upgrade-title">正在下载{{ kindText }}升级包</h4>
        <p class="ui-upgrade-msg">{{ d.msg || '正在下载，请稍候…' }}</p>

        <div class="ui-progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
          <div class="ui-progress__bar" :style="{ width: percent + '%' }" />
        </div>
        <small class="ui-help" style="margin-top: 0">{{ percent }}%</small>

        <p class="ui-upgrade-note">
          升级包较大，下载需要一些时间。下载完成后会询问是否立即升级，期间请勿关闭页面。
        </p>
      </div>
    </div>
  </Teleport>
</template>
