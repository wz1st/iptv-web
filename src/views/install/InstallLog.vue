<script setup>
// 更新记录页 —— 重构自 install_log.html，版式对齐 One-KVM（点阵底 + 居中卡片）。
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BrandMark from '@/components/BrandMark.vue'
import { fetchText } from '@/utils/request'
import { renderMarkdown } from '@/utils/markdown'
import { siteName } from '@/utils/site'
import { API } from '@/api/endpoints'

const md = ref('')
const loaded = ref(false)
const html = computed(() => renderMarkdown(md.value))
const year = new Date().getFullYear()
const router = useRouter()

onMounted(async () => {
  try {
    md.value = await fetchText(API.changeLog)
  } catch {
    md.value = '> 更新记录加载失败'
  } finally {
    loaded.value = true
  }
})
</script>

<template>
  <div class="dot-grid-bg flex min-h-screen min-h-dvh justify-center p-4 sm:p-6">
    <Card class="h-fit w-full max-w-3xl">
      <CardHeader>
        <div class="flex items-center gap-3">
          <BrandMark size="lg" />
          <div class="space-y-1">
            <CardTitle class="text-lg">更新记录</CardTitle>
            <CardDescription>镜像内 ChangeLog.md 的原文</CardDescription>
          </div>
        </div>
        <CardAction>
          <Button type="button" variant="outline" @click="router.push('/install')">返回安装</Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <article v-if="md" class="md-body" v-html="html" />
        <p v-else-if="loaded" class="py-8 text-center text-sm text-muted-foreground">
          镜像内未提供 ChangeLog.md。
        </p>
        <p v-else class="py-8 text-center text-sm text-muted-foreground">正在加载更新记录…</p>
      </CardContent>

      <CardFooter class="justify-center border-t pt-6 text-xs text-muted-foreground">
        <span>&copy; {{ year }} {{ siteName }}</span>
        <span class="mx-2 text-border">·</span>
        <a class="hover:text-foreground" href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
      </CardFooter>
    </Card>
  </div>
</template>
