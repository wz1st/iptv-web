<script setup>
// 管理端通用标签条（纯展示组件）。
defineProps({
  /** [{ key, label, path?, hint? }]，key 是稳定标识，label 是显示文案 */
  tabs: { type: Array, required: true },
  /** 当前选中的 key */
  active: { type: String, required: true },
})

const emit = defineEmits(['change'])
</script>

<template>
  <div class="ui-tabs" role="tablist">
    <button
      v-for="t in tabs"
      :key="t.key"
      class="ui-tabs__item"
      :class="{ 'is-active': t.key === active }"
      type="button"
      role="tab"
      :aria-selected="t.key === active"
      :title="t.hint || t.label"
      @click="emit('change', t.key)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
