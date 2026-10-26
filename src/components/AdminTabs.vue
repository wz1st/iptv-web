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
      <span v-if="t.badge" class="ui-tabs__dot" />
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}
.ui-tabs__item {
  position: relative;
  padding: 8px 14px;
  font-size: 14px;
  color: var(--muted-foreground);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.ui-tabs__item.is-active {
  color: var(--foreground);
  border-bottom-color: var(--primary);
  font-weight: 600;
}
/* 标签上的红色小圆点：提示该壳基底有更新。 */
.ui-tabs__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--c-danger);
  vertical-align: middle;
}
</style>
