<script setup>
// 通用模态框 —— 替代 bootstrap-modal。
import { watch, onBeforeUnmount } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '@/utils/scrollLock'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: '' }, // '', 'lg', 'xl'
  closeOnMask: { type: Boolean, default: true },
  // 额外挂到遮罩元素上的 class。用途只有一个：给**后开的浮层**抬一档层级。
  maskClass: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'close'])

// body 滚动锁：交给 utils/scrollLock 计数管理，**不要在这里自己写 let 计数**。

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function onMask(e) {
  if (props.closeOnMask && e.target === e.currentTarget) close()
}

function onEsc(e) {
  if (e.key === 'Escape' && props.modelValue) close()
}

watch(
  () => props.modelValue,
  (v, old) => {
    if (v === old) return
    if (v) {
      lockBodyScroll()
      window.addEventListener('keydown', onEsc)
    } else {
      unlockBodyScroll()
      window.removeEventListener('keydown', onEsc)
    }
  }
)

onBeforeUnmount(() => {
  // 只有"自己开着"才归还锁；无条件复位会把别的弹窗的锁一起解掉。
  if (props.modelValue) unlockBodyScroll()
  window.removeEventListener('keydown', onEsc)
})

defineExpose({ close })
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ui-modal-mask" :class="maskClass" @click="onMask">
      <div class="ui-modal" :class="{ 'ui-modal--lg': size === 'lg', 'ui-modal--xl': size === 'xl' }">
        <div class="ui-modal__header">
          <span class="ui-modal__title">{{ title }}</span>
          <button class="ui-modal__close" type="button" @click="close">&times;</button>
        </div>
        <div class="ui-modal__body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ui-modal__footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
