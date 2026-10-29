<script setup>
// 可关闭的"更新提醒"小标签：红点 + 文案 + 关闭按钮。
// 挂在各「检测更新 / 在线升级」按钮右侧；有红点且用户没关过时才显示，
// 关闭后本次登录期内不再出现（见 composables/useUpdateBadge.js）。
import { useUpdateBadge } from '@/composables/useUpdateBadge'

const props = defineProps({
  // 组件键：web / engine / qh / lt / mytv
  name: { type: String, required: true },
  text: { type: String, default: '发现新版本，点击按钮即可升级' },
})

const { tipVisible, dismissTip } = useUpdateBadge()
</script>

<template>
  <transition name="update-tip-fade">
    <span v-if="tipVisible(name)" class="update-tip">
      <span class="update-tip__dot" />
      <span class="update-tip__text">{{ text }}</span>
      <button
        class="update-tip__close"
        type="button"
        aria-label="关闭提醒"
        @click="dismissTip(name)"
      >×</button>
    </span>
  </transition>
</template>

<style scoped>
.update-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding: 3px 8px 3px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--c-danger);
  background: var(--c-danger-soft);
  border: 1px solid color-mix(in oklab, var(--c-danger) 38%, transparent);
  border-radius: 999px;
  vertical-align: middle;
  white-space: nowrap;
}
.update-tip__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-danger);
  flex: none;
}
.update-tip__close {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  opacity: 0.65;
  font-size: 15px;
  line-height: 1;
  padding: 0 1px;
  border-radius: 50%;
}
.update-tip__close:hover { opacity: 1; }
.update-tip-fade-enter-active,
.update-tip-fade-leave-active { transition: opacity 0.2s ease; }
.update-tip-fade-enter-from,
.update-tip-fade-leave-to { opacity: 0; }
</style>
