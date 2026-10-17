<script setup>
// 使用说明 —— 首次进入系统的引导页。渲染 POST /api/guide/data 返回的 Guide.md 原文。
// 未确认（guideAck=false）时由路由守卫锁定在本页，其它后台页进不去；
// 必须阅读至页尾并点击「我已知晓系统使用方法」后，才放行其余页面。
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { post } from '@/api/http'
import { renderMarkdown } from '@/utils/markdown'
import { API } from '@/api/endpoints'
import { guideAck } from '@/utils/site'
import { notify } from '@/utils/feedback'

const router = useRouter()
const content = ref('')
const loading = ref(true)
const canAck = ref(false)
const scrollEl = ref(null)

const html = computed(() => renderMarkdown(content.value))

async function load() {
  loading.value = true
  try {
    const res = await post(API.adminGuideData)
    content.value = res?.content || ''
  } catch {
    content.value = ''
  } finally {
    loading.value = false
    await nextTick()
    // 内容较短（未出现滚动条）时视为已可确认；否则需滚动到页尾。
    checkBottom()
    bindImgLoad()
  }
}

// 图片加载完成后高度会变，重新判定是否已在页尾。
function bindImgLoad() {
  const imgs = Array.from(document.querySelectorAll('.guide-scroll img'))
  imgs.forEach((img) => {
    if (img.complete) return
    img.addEventListener('load', checkBottom, { once: true })
    img.addEventListener('error', checkBottom, { once: true })
  })
}

function onScroll() {
  checkBottom()
}

function checkBottom() {
  const el = scrollEl.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) canAck.value = true
}

async function ack() {
  if (!canAck.value) return
  try {
    const res = await post(API.adminGuideAck)
    if (res?.code === 1) {
      guideAck.value = true
      notify(res.msg || '已确认', 'success', 1500)
      router.push('/admin/index')
      return
    }
    notify(res?.msg || '确认失败', res?.type || 'danger', 2500)
  } catch {
    notify('确认失败，请重试', 'danger', 2000)
  }
}

onMounted(load)
</script>

<template>
  <div class="ui-card">
    <div class="ui-card__header">
      <h4>使用说明</h4>
    </div>
    <div class="ui-card__body">
      <div class="guide-notice">
        <strong>请先完整阅读以下使用说明。</strong>
        阅读至页尾并点击页面底部的「我已知晓系统使用方法」后，方可进入系统其它页面。
      </div>

      <div v-if="loading" class="ui-alert ui-alert--info">
        <span class="ui-spinner" />正在加载…
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- 内容已由 renderMarkdown 按标签/属性白名单消毒 -->
      <div
        v-else-if="content"
        ref="scrollEl"
        class="md-body guide-scroll"
        :class="{ 'guide-scroll--locked': !canAck }"
        @scroll="onScroll"
        v-html="html"
      />
      <div v-else class="ui-alert ui-alert--warning">暂无可显示的内容（Guide.md 未找到）。</div>
    </div>
  </div>

  <div class="guide-foot" :class="{ 'guide-foot--locked': !canAck }">
    <button
      class="ui-btn ui-btn--primary"
      type="button"
      :disabled="!canAck"
      @click="ack"
    >
      {{ canAck ? '我已知晓系统使用方法' : '请阅读至页尾后再确认' }}
    </button>
  </div>
</template>

<style scoped>
.guide-notice {
  margin-bottom: 14px;
  padding: 10px 14px;
  border-left: 3px solid var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-text-2);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.7;
}
.guide-scroll {
  max-height: calc(100dvh - 250px);
  overflow-y: auto;
  padding-right: 6px;
}
/* md-body 基础排版沿用升级日志的口径 */
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
.md-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 6px 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  vertical-align: middle;
}
.md-body :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 13px; font-size: 12.5px; }
.md-body :deep(th), .md-body :deep(td) { padding: 7px 10px; border: 1px solid var(--c-border); text-align: left; }
.md-body :deep(th) { background: var(--c-surface-2); font-weight: 600; }

.guide-foot {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.guide-foot .ui-btn {
  min-width: 240px;
  padding: 12px 20px;
  font-size: 15px;
}
.guide-foot--locked .ui-btn {
  opacity: 0.65;
}
</style>
