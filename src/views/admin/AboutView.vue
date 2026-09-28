<script setup>
// 升级日志 —— 渲染 POST /api/about/data 返回的 ChangeLog.md 原文。
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { post } from '@/api/http'
import { renderMarkdown } from '@/utils/markdown'
import { API } from '@/api/endpoints'

const route = useRoute()
const content = ref('')
const loading = ref(true)

const html = computed(() => renderMarkdown(content.value))

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminAboutData)
    content.value = res?.content || ''
  } catch {
    content.value = ''
  } finally {
    loading.value = false
    if (route.hash === '#bottom') await scrollBottom()
  }
}
onMounted(load)

/* 「赞助作者」滚到底 —— 严格两步： */
async function scrollBottom() {
  await nextTick()
  const imgs = Array.from(document.querySelectorAll('.md-body img'))
  await Promise.all(imgs.map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise((res) => {
          img.addEventListener('load', res, { once: true })
          img.addEventListener('error', res, { once: true })
        })
  ))
  const payQr = document.querySelector('.pay-qr')
  if (payQr) {
    payQr.scrollIntoView({ block: 'start', behavior: 'smooth' })
  } else {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }
}

watch(() => route.hash, (h) => { if (h === '#bottom') scrollBottom() })
</script>

<template>
  <div class="ui-card">
    <div class="ui-card__header"><h4>升级日志</h4></div>
    <div class="ui-card__body">
      <div v-if="loading" class="ui-alert ui-alert--info">
        <span class="ui-spinner" />正在加载…
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- 内容已由 renderMarkdown 按标签/属性白名单消毒 -->
      <div v-else-if="content" class="md-body" v-html="html" />
      <div v-else class="ui-alert ui-alert--warning">暂无可显示的内容（ChangeLog.md 未找到）。</div>
    </div>
  </div>
</template>

<style scoped>
.md-body {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--c-text);
  word-break: break-word;
}
.md-body :deep(h1) { font-size: 21px; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--c-border); }
.md-body :deep(h2) { font-size: 18px; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--c-border); }
.md-body :deep(h3) { font-size: 15.5px; margin: 16px 0 8px; }
.md-body :deep(h4), .md-body :deep(h5), .md-body :deep(h6) { font-size: 14px; margin: 14px 0 6px; }
.md-body :deep(h1:first-child), .md-body :deep(h2:first-child) { margin-top: 0; }
.md-body :deep(p) { margin: 0 0 11px; }
.md-body :deep(a) { color: var(--c-primary); text-decoration: none; }
.md-body :deep(a:hover) { text-decoration: underline; }
.md-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--c-surface-2);
  color: var(--c-danger);
}
.md-body :deep(pre) {
  margin: 0 0 13px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
  overflow-x: auto;
}
.md-body :deep(pre code) { padding: 0; background: transparent; color: var(--c-text); font-size: 12.5px; }
.md-body :deep(blockquote) {
  margin: 0 0 13px;
  padding: 6px 14px;
  border-left: 3px solid var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-text-2);
}
.md-body :deep(ul), .md-body :deep(ol) { margin: 0 0 13px; padding-left: 24px; }
.md-body :deep(li) { margin: 3px 0; }
.md-body :deep(hr) { border: none; border-top: 1px solid var(--c-border); margin: 18px 0; }
.md-body :deep(img) { max-width: 100%; height: auto; border-radius: var(--radius-sm); vertical-align: middle; }
.md-body :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 13px; font-size: 12.5px; }
.md-body :deep(th), .md-body :deep(td) { padding: 7px 10px; border: 1px solid var(--c-border); text-align: left; }
.md-body :deep(th) { background: var(--c-surface-2); font-weight: 600; }
</style>
