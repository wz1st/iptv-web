<script setup>
// 多选下拉 —— 替代 xm-select，支持带 logo 的选项、单选、可筛选、向下/向上弹出。
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [Array, String, Number, null], default: () => [] },
  options: { type: Array, default: () => [] }, // [{ name, value, logo?, disabled? }]
  multiple: { type: Boolean, default: true },
  placeholder: { type: String, default: '请选择' },
  filterable: { type: Boolean, default: false },
  direction: { type: String, default: 'down' }, // down | up
  disabled: { type: Boolean, default: false },
  maxTagText: { type: Number, default: 0 }, // >0 时折叠标签
})
const emit = defineEmits(['update:modelValue', 'change'])

const open = ref(false)
const keyword = ref('')
const rootEl = ref(null)
const boxEl = ref(null)   // 触发框：浮层的位置由它算出来
const dropEl = ref(null)  // 浮层本体（已挂到 body 上，不在 rootEl 里）

const selected = computed(() => {
  const v = props.modelValue
  if (props.multiple) return Array.isArray(v) ? v : []
  return v === '' || v === null || v === undefined ? [] : [v]
})

const filtered = computed(() => {
  if (!keyword.value) return props.options
  const kw = keyword.value.toLowerCase()
  return props.options.filter((o) => String(o.name).toLowerCase().includes(kw))
})

// 浮层定位
const GAP = 4
const dropStyle = ref({})

function place() {
  const box = boxEl.value
  if (!box) return
  const r = box.getBoundingClientRect()
  const dropH = dropEl.value?.offsetHeight || 0
  const below = window.innerHeight - r.bottom - GAP
  const above = r.top - GAP

  // 先按 direction，装不下再自动翻向（dropH 为 0 表示面板还没渲染好，保持原方向）
  let up = props.direction === 'up'
  if (dropH > 0) {
    if (!up && below < dropH && above > below) up = true
    else if (up && above < dropH && below > above) up = false
  }

  dropStyle.value = {
    left: `${Math.round(r.left)}px`,
    width: `${Math.round(r.width)}px`,
  }
  dropStyle.value[up ? 'bottom' : 'top'] =
    `${Math.round(up ? window.innerHeight - r.top + GAP : r.bottom + GAP)}px`
}

/** 标签折叠显示 */
const visibleTags = computed(() => {
  if (props.multiple && props.maxTagText > 0) return selected.value.slice(0, props.maxTagText)
  return selected.value
})
const hiddenCount = computed(() => Math.max(0, selected.value.length - visibleTags.value.length))

function labelOf(val) {
  const hit = props.options.find((o) => String(o.value) === String(val))
  return hit ? hit.name : String(val)
}

function isActive(val) {
  return selected.value.some((v) => String(v) === String(val))
}

/** 展开/收起。展开时先按触发框摆位，面板渲染出来后再按真实高度校正一次 */
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    place()
    nextTick(place)
  }
}

/* 单选：选中即关闭；多选：切换累加。 */
function pick(opt) {
  if (props.disabled || opt.disabled) return

  if (props.multiple) {
    const next = selected.value.slice()
    const idx = next.findIndex((v) => String(v) === String(opt.value))
    if (idx > -1) next.splice(idx, 1)
    else next.push(opt.value)
    emit('update:modelValue', next)
    emit('change', next.map((v) => props.options.find((o) => String(o.value) === String(v))).filter(Boolean))
  } else {
    emit('update:modelValue', opt.value)
    emit('change', opt)
    open.value = false
  }
}

function removeTag(val) {
  if (props.disabled) return
  const next = selected.value.filter((v) => String(v) !== String(val))
  emit('update:modelValue', next)
  emit('change', next)
}

function clearAll() {
  if (props.disabled) return
  emit('update:modelValue', props.multiple ? [] : '')
  emit('change', props.multiple ? [] : null)
}

function onDocClick(e) {
  if (rootEl.value?.contains(e.target)) return
  if (dropEl.value?.contains(e.target)) return  // 浮层已 Teleport 出 rootEl，得单独兜住
  open.value = false
}

// 浮层是 fixed 定位：页面/弹窗一滚就要重算。只在展开期间挂监听。
watch(open, (v) => {
  if (v) {
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
  } else {
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place)
  }
})

// 筛选会让列表变长变短，位置/翻转方向要跟着重算
watch([keyword, () => filtered.value.length], () => {
  if (open.value) nextTick(place)
})

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
})

defineExpose({ clearAll })
</script>

<template>
  <div ref="rootEl" class="ui-tagselect">
    <div
      ref="boxEl"
      class="ui-tagselect__box"
      :style="disabled ? 'opacity:.6;cursor:not-allowed' : ''"
      @click="toggle"
    >
      <template v-if="selected.length">
        <span v-for="v in visibleTags" :key="String(v)" class="ui-tagselect__tag">
          {{ labelOf(v) }}
          <button v-if="!disabled" type="button" @click.stop="removeTag(v)">&times;</button>
        </span>
        <span v-if="hiddenCount" class="ui-tagselect__tag">+{{ hiddenCount }}</span>
      </template>
      <span v-else class="ui-tagselect__ph">{{ placeholder }}</span>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="dropEl"
        class="ui-tagselect__drop"
        :style="dropStyle"
        @click.stop
      >
        <div v-if="filterable" style="padding: 4px 5px 7px">
          <input v-model="keyword" class="ui-input ui-input--sm" placeholder="搜索…" @click.stop />
        </div>

        <div
          v-for="o in filtered"
          :key="String(o.value)"
          class="ui-tagselect__opt"
          :class="{ 'is-active': isActive(o.value) }"
          :style="o.disabled ? 'opacity:.45;cursor:not-allowed' : ''"
          @click="pick(o)"
        >
          <input
            v-if="multiple"
            type="checkbox"
            :checked="isActive(o.value)"
            :disabled="o.disabled"
            @click.stop="pick(o)"
          />
          <img v-else-if="o.logo" class="ui-tagselect__logo" :src="o.logo" alt="" @click.stop="pick(o)" />
          <span v-if="multiple && o.logo" class="ui-tagselect__logo" :style="`background-image:url(${o.logo})`" />
          <span>{{ o.name }}</span>
        </div>

        <div v-if="!filtered.length" style="padding: 10px; text-align: center; color: var(--c-text-3); font-size: 12.5px">
          无匹配项
        </div>

        <div v-if="filtered.length" style="border-top: 1px solid var(--c-border); margin-top: 4px; padding-top: 4px">
          <button class="ui-btn ui-btn--text ui-btn--xs" type="button" style="width: 100%" @click="clearAll">清空选择</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
