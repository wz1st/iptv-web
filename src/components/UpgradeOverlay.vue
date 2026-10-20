<script setup>
// 在线升级遮罩 —— 全局挂一份，跨路由存活。
//
// 为什么挂在应用根而不是升级页：升级动作会重启 api 进程，这期间用户刷新页面或
// 切到别的路由是常事；遮罩只要挂在 <router-view> 外面就天然跟着走，不需要
// 任何"切页时重新判断"的逻辑。
//
// 层级刻意高于 LoadingLayer（2900）：升级期间的其它请求会陆续失败，前端可能
// 顺手 loadingShow()，那个转圈不该浮在升级遮罩上面（看着像还有别的事在跑）。
import { computed } from 'vue'
import { upgradeState } from '@/utils/upgrade'

const s = upgradeState()

const KIND_TEXT = {
  web: '管理系统与前端',
  engine: '引擎',
}
const kindText = computed(() => KIND_TEXT[s.kind] || '管理系统')
// 百分比夹在 0~100：后端已经夹过一次，这里再夹是为了让 CSS width 永远合法
// （负数或 NaN 会让整条进度条消失，比显示错更让人困惑）。
const percent = computed(() => Math.max(0, Math.min(100, Number(s.percent) || 0)))
</script>

<template>
  <Teleport to="body">
    <div v-if="s.running" class="ui-upgrade-mask" role="alertdialog" aria-live="polite">
      <div class="ui-upgrade-card">
        <div class="ui-spinner" />
        <h4 class="ui-upgrade-title">正在升级{{ kindText }}</h4>
        <p class="ui-upgrade-msg">{{ s.msg || '正在处理，请稍候…' }}</p>

        <div class="ui-progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
          <div class="ui-progress__bar" :style="{ width: percent + '%' }" />
        </div>
        <small class="ui-help" style="margin-top: 0">{{ percent }}%</small>

        <p class="ui-upgrade-note">
          升级过程中管理系统会重启一次，页面可能短暂断开并自动恢复。<br />
          在升级完成或失败之前，界面会保持遮罩 —— 这期间任何操作都可能撞上
          「半个新、半个旧」的运行态。
        </p>
      </div>
    </div>
  </Teleport>
</template>
