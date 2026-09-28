<script setup>
/** 开关 —— 替代 lightyear-switch。v-model 用 0/1 数字以匹配后端字段语义 */
const props = defineProps({
  modelValue: { type: [Number, Boolean, String], default: 0 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])

function toggle(e) {
  if (props.disabled) return
  const next = e.target.checked ? 1 : 0
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <label class="ui-switch">
    <input
      type="checkbox"
      :checked="modelValue === 1 || modelValue === true || modelValue === '1'"
      :disabled="disabled"
      @change="toggle"
    />
    <span class="ui-switch__track" />
    <span v-if="label">{{ label }}</span>
    <slot />
  </label>
</template>
