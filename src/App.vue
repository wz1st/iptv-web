<script setup>
// 应用根组件。
import 'vue-sonner/style.css'
import '@/sonner-overrides.css'
import { Toaster } from '@/components/ui/sonner'
import LoadingLayer from '@/components/LoadingLayer.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
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
