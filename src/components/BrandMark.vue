<script setup>
// 品牌标识 —— 登录页、安装向导、后台外壳共用的那个 logo。
import { computed } from 'vue'

const props = defineProps({
  /** xs | sm | md | lg | xl —— 与 One-KVM 的档位保持一致 */
  size: { type: String, default: 'md' },
  class: { type: String, default: '' },
})

const SIZES = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-6',
  lg: 'size-10',
  xl: 'size-14',
}

const LOGO = '/static/images/logo.png'

const dim = computed(() => SIZES[props.size] || SIZES.md)
</script>

<template>
  <img
    :src="LOGO"
    alt=""
    :class="['shrink-0 select-none object-contain', dim, props.class]"
    decoding="async"
    draggable="false"
  />
</template>
