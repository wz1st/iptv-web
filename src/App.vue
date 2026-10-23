<script setup>
// 应用根组件。
import 'vue-sonner/style.css'
import '@/sonner-overrides.css'
import { Toaster } from '@/components/ui/sonner'
import LoadingLayer from '@/components/LoadingLayer.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpgradeOverlay from '@/components/UpgradeOverlay.vue'
import DownloadOverlay from '@/components/DownloadOverlay.vue'
import { useTheme } from '@/composables/useTheme'
import { onMounted } from 'vue'
import { startUpgradeWatch } from '@/utils/upgrade'
import { startDownloadWatch } from '@/utils/download'

const { isDark } = useTheme()

// 在线升级遮罩的轮询在这里起一次就够：遮罩挂在应用根，切路由不受影响，
// 刷新页面时靠 localStorage 标记 + 服务端状态恢复。
//
// 下载遮罩同理，另加一条"刷新页面时若后台正在下载就把遮罩接回来"——
// 刷新会把那次下载请求一起丢掉，但服务端的下载线程还在跑。
onMounted(() => {
  startUpgradeWatch()
  startDownloadWatch()
})
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
  <DownloadOverlay />
</template>
