<script setup>
// 应用根组件。
import 'vue-sonner/style.css'
import '@/sonner-overrides.css'
import { Toaster } from '@/components/ui/sonner'
import LoadingLayer from '@/components/LoadingLayer.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpgradeOverlay from '@/components/UpgradeOverlay.vue'
import { useTheme } from '@/composables/useTheme'
import { onMounted } from 'vue'
import { startUpgradeWatch } from '@/utils/upgrade'

const { isDark } = useTheme()

// 在线升级遮罩的轮询在这里起一次就够：遮罩挂在应用根，切路由不受影响，
// 刷新页面时靠 localStorage 标记 + 服务端状态恢复。
onMounted(startUpgradeWatch)
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
  <UpgradeOverlay />
</template>
