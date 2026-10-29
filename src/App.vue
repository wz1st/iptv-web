<script setup>
// 应用根组件。
import 'vue-sonner/style.css'
import '@/sonner-overrides.css'
import { Toaster } from '@/components/ui/sonner'
import LoadingLayer from '@/components/LoadingLayer.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()

// 定制分支整体移除管理系统「自身在线升级」遮罩（换镜像更新），
// 但保留客户端 / 引擎 / 骆驼壳基底的在线升级提示。
</script>

<template>
  <router-view />

  <Toaster
    position="bottom-right"
    rich-colors
    close-button
    expand
    :theme="isDark ? 'dark' : 'light'"
    :duration="4000"
    :gap="14"
    :offset="{ right: '1rem', bottom: '1rem' }"
  />

  <LoadingLayer />
  <ConfirmHost />
</template>
