<script setup>
// 分页器 —— 保留旧版「首页 / 上一页 / 下一页 / 尾页 + 页码跳转」的行为。
import { computed, ref, watch } from 'vue'

const props = defineProps({
  page: { type: Number, default: 1 },
  pageCount: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
})
const emit = defineEmits(['page-change'])

const jump = ref(String(props.page))
watch(() => props.page, (v) => { jump.value = String(v) })

const canPrev = computed(() => props.page > 1)
const canNext = computed(() => props.page < props.pageCount)
const visible = computed(() => props.pageCount > 1)

function go(p) {
  const target = Math.min(Math.max(1, p), Math.max(1, props.pageCount))
  if (target !== props.page) emit('page-change', target)
}

function doJump() {
  const n = parseInt(jump.value, 10)
  if (Number.isNaN(n)) { jump.value = String(props.page); return }
  go(n)
}
</script>

<template>
  <div v-if="visible" class="ui-pager">
    <button class="ui-pager__item" :class="{ 'is-disabled': !canPrev }" type="button" @click="go(1)">&larr; 首页</button>
    <button class="ui-pager__item" :class="{ 'is-disabled': !canPrev }" type="button" @click="go(page - 1)">上一页</button>
    <span class="ui-pager__info">
      第 {{ page }} / {{ pageCount }} 页<template v-if="total > 0">（共 {{ total }} 条）</template>
    </span>
    <button class="ui-pager__item" :class="{ 'is-disabled': !canNext }" type="button" @click="go(page + 1)">下一页</button>
    <button class="ui-pager__item" :class="{ 'is-disabled': !canNext }" type="button" @click="go(pageCount)">尾页 &rarr;</button>
    <span class="ui-pager__jump">
      跳至
      <input v-model="jump" class="ui-input ui-input--sm" @keyup.enter="doJump" />
      页
      <button class="ui-btn ui-btn--xs" type="button" @click="doJump">确定</button>
    </span>
  </div>
</template>
