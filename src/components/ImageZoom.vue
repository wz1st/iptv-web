<script setup>
// 图片放大预览浮层（台标「点击放大」）。
import { onMounted, onBeforeUnmount } from 'vue'
import { zoomSrc, zoomAlt, zoomButtons, closeImageZoom } from '@/utils/imageZoom'

function onKey(e) {
  if (e.key === 'Escape') closeImageZoom()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- Teleport 到 body：台标常常出现在**弹窗里**（频道管理的 LOGO 列），
       待在弹窗的 DOM 里会被弹窗的层叠上下文/overflow 裁掉。 -->
  <Teleport to="body">
    <div
      v-if="zoomSrc"
      class="img-zoom"
      role="dialog"
      aria-modal="true"
      aria-label="台标大图"
      @click="closeImageZoom"
    >
      <!-- 用 flex 列容器把「图 + 按钮」竖着排：按钮必须在**图片下方**，
           而不是压在图上（压在图上会和"点任意处关闭"抢热区）。 -->
      <div class="img-zoom__panel" @click.stop>
        <img class="img-zoom__img" :src="zoomSrc" :alt="zoomAlt" />
        <div v-if="zoomButtons.length" class="img-zoom__actions">
          <button
            v-for="(b, i) in zoomButtons"
            :key="i"
            class="ui-btn ui-btn--xs"
            :class="{ 'ui-btn--danger': b.danger }"
            type="button"
            @click="b.onClick && b.onClick()"
          >
            {{ b.label }}
          </button>
        </div>
      </div>
      <span class="img-zoom__hint" aria-hidden="true">点击任意处关闭</span>
    </div>
  </Teleport>
</template>
