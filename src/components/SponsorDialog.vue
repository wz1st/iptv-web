<script setup>
// 赞助作者弹窗 —— 展示微信 / 支付宝两个收款二维码。
//
// 原来「赞助作者」是侧栏底部一个链接，跳到「升级日志」页并滚到底部去找二维码。
// 升级日志页取消后改成弹窗：点一下就出来，不用滚。
//
// 布局：电脑端两个二维码左右并排（grid-cols-2），窄屏上下堆叠。
import AppModal from '@/components/AppModal.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <AppModal
    :model-value="props.modelValue"
    title="赞助作者"
    size="lg"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <p class="sponsor__lead">
      如果这个项目帮到了你，欢迎请作者喝杯咖啡。下方是微信与支付宝的收款码，
      扫码自愿，不影响任何功能。
    </p>

    <div class="sponsor__grid">
      <figure class="sponsor__item">
        <img class="sponsor__qr" src="/static/images/wxpay.jpg" alt="微信收款码" />
        <figcaption class="sponsor__label">微信</figcaption>
      </figure>
      <figure class="sponsor__item">
        <img class="sponsor__qr" src="/static/images/zfbpay.jpg" alt="支付宝收款码" />
        <figcaption class="sponsor__label">支付宝</figcaption>
      </figure>
    </div>

    <template #footer>
      <button class="ui-btn" type="button" @click="close">关闭</button>
    </template>
  </AppModal>
</template>

<style scoped>
.sponsor__lead {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-2);
}
.sponsor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.sponsor__item {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sponsor__qr {
  width: 100%;
  max-width: 220px;
  height: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  background: #fff;
}
.sponsor__label {
  font-size: 13px;
  color: var(--c-text);
}

/* 窄屏（手机 / 竖屏平板）两个码上下堆叠，避免挤成两小条。 */
@media (max-width: 560px) {
  .sponsor__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .sponsor__qr {
    max-width: 180px;
  }
}
</style>
