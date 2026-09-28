<script setup>
/** 全局确认框渲染器 —— 由 main.js 挂载一次 */
import { confirmState, resolveConfirm } from '@/utils/confirm'
import AppModal from './AppModal.vue'

const state = confirmState()
</script>

<template>
  <AppModal
    :model-value="state.visible"
    :title="state.title"
    :close-on-mask="false"
    mask-class="ui-modal-mask--confirm"
    @update:model-value="(v) => { if (!v) resolveConfirm(false) }"
  >
    <div style="line-height: 1.7; white-space: pre-wrap">{{ state.content }}</div>
    <template #footer>
      <button
        v-if="state.showCancel"
        class="ui-btn"
        type="button"
        @click="resolveConfirm(false)"
      >
        {{ state.cancelText }}
      </button>
      <button
        class="ui-btn"
        :class="state.okVariant === 'danger' ? 'ui-btn--danger' : 'ui-btn--primary'"
        type="button"
        @click="resolveConfirm(true)"
      >
        {{ state.okText }}
      </button>
    </template>
  </AppModal>
</template>
