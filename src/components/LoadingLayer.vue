<script setup>
/** 全局 loading 遮罩 —— 替代 lightyear.loading('show'/'hide') */
import { useFeedback } from '@/utils/feedback'

const state = useFeedback()
</script>

<template>
  <div v-if="state.loadingCount > 0" class="ui-loading-layer">
    <div class="ui-spinner" />
  </div>
</template>
