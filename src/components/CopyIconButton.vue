<script setup>
// 复制图标按钮 —— 订阅地址弹窗与频道列表编辑器共用**同一份**实现。
import { ref, onBeforeUnmount } from 'vue'
import { Button } from '@/components/ui/button'
import AppIcon from '@/components/AppIcon.vue'
import { notify } from '@/utils/feedback'

const props = defineProps({
  /** 要写进剪贴板的文本；为空时不复制（按钮同时置灰） */
  text: { type: String, default: '' },
  /** 悬停提示。图标按钮没有文字，它和 aria-label 是唯一的可读名 */
  title: { type: String, default: '复制' },
  /** 无障碍名，缺省用 title */
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const copied = ref(false)
let timer = null

/** 返回"是否真的写进去了" —— 失败分支要据此决定弹不弹 toast */
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非安全上下文 / headless 无权限：走 execCommand，选区得自己铺
    let ta
    try {
      ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      ta?.remove()
    }
  }
}

async function onClick() {
  const text = props.text
  if (!text || !text.trim()) return
  if (!(await writeClipboard(text))) {
    notify('复制失败，请手动选中后复制', 'danger')
    return
  }
  copied.value = true
  // 先 clear 再 set：连点两次时上一次的定时器会把这次的对勾提前收回去
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 1500)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    class="ui-ibtn shrink-0"
    type="button"
    :title="title"
    :aria-label="label || title"
    :disabled="disabled || !text"
    @click="onClick"
  >
    <AppIcon v-if="copied" name="check" class="size-3.5 text-success" />
    <AppIcon v-else name="copy" class="size-3.5" />
  </Button>
</template>
