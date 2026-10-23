<script setup>
// 带行号的文本编辑器 —— 「频道分组 → 编辑频道」弹窗里那份频道列表用它。
import { ref, computed, onBeforeUnmount } from 'vue'
import CopyIconButton from '@/components/CopyIconButton.vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 只读态：内容不可编辑（底色压灰）。**不影响**行号区的状态切换与复制 */
  readonly: { type: Boolean, default: false },
  rows: { type: [Number, String], default: 15 },
  /** 行数上限：内容超过它才在框内滚动（滚动条隐藏，滚轮仍可滚）。 */
  maxRows: { type: [Number, String], default: 30 },
  placeholder: { type: String, default: '' },
  // 显式停用行：数组里每一项与某一行的内容**逐字相同**即算停用。
  // 这是当前的主渠道；文本里自带 `0|`/`1|` 前缀的行不查它（前缀优先，见 isOff）。
  offLines: { type: Array, default: () => [] },
  // 行号区是否可切换停用/启用。**与 readonly 独立**：
  // 「查看频道」弹窗需要的是"文本只读 + 状态可改"，两个能力各由一个 prop 说了算。
  toggleable: { type: Boolean, default: false },
  copyTitle: { type: String, default: '复制' },
  copyLabel: { type: String, default: '复制' },
  // 逐行悬停提示：下标 i 的字符串是第 i 行（0-based，与 modelValue 的行序一致）的
  lineTips: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'toggle-off'])

/** 行高（px）—— 必须与 CSS 里的 `--lned-lh` 一致，行号/色带都按它算偏移 */
const LINE_H = 20
/** textarea 的 padding-top（px）—— 必须与 CSS 里的 `--lned-pt` 一致 */
const PAD_TOP = 8

const taEl = ref(null)
const scrollTop = ref(0)

// 行内容 → 比较用的键。
const normKey = (s) => String(s ?? '').replace(/\r$/, '')

/** 行首的状态前缀（`0|` 停用 / `1|` 启用）—— 与 until.AddChannelList 的解析一致 */
const INBAND_PREFIX = /^[01]\|/

const offSet = computed(() => new Set((props.offLines || []).map(normKey)))

// 某一行算不算停用。两个来源**有优先级**：
function isOff(text) {
  const m = INBAND_PREFIX.exec(text.trimStart())
  if (m) return m[0][0] === '0'
  return offSet.value.has(normKey(text))
}

const lines = computed(() =>
  String(props.modelValue ?? '')
    .split('\n')
    .map((text) => ({ text, off: isOff(text) }))
)

/**
 * textarea 的实际行数：随内容行数自适应（上限 maxRows）。
 * 固定 rows 会出现"行号列按内容总行数撑高、文本区却只有固定行数"——
 * 结果是下半截只有行号没有内容，且框内冒出纵向滚动条。
 */
const effectiveRows = computed(() => {
  const min = Math.max(1, Number(props.rows) || 15)
  const max = Math.max(min, Number(props.maxRows) || 30)
  return Math.min(Math.max(lines.value.length, min), max)
})

/** 色带偏移：内容区第 i 行的顶边，再减去已滚动的距离 */
const bandTop = (i) => `${PAD_TOP + i * LINE_H - scrollTop.value}px`

// 需要画色带的行号（0-based）。
const offBands = computed(() =>
  lines.value.reduce((acc, l, i) => {
    if (l.off) acc.push(i)
    return acc
  }, [])
)

// 复制内容 = 所有**非停用行**。
const copyText = computed(() =>
  lines.value
    .filter((l) => !l.off)
    .map((l) => l.text)
    .join('\n')
    .replace(/\n+$/, '')
)

/** 行号区的切换按钮：只发事件，真正改哪一份状态由父组件说了算 */
function toggleOff(i) {
  if (!props.toggleable) return
  const line = lines.value[i]
  if (!line || !line.text.trim()) return
  emit('toggle-off', i, line.text)
}

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

function onScroll() {
  scrollTop.value = taEl.value?.scrollTop || 0
}

// 鼠标当前所在行的提示（挂到 textarea 的 title 上）。
const hoverTip = ref('')
function onMouseMove(e) {
  const tips = props.lineTips
  if (!tips.length) {
    if (hoverTip.value) hoverTip.value = ''
    return
  }
  const y = (e.offsetY || 0) + scrollTop.value - PAD_TOP
  const i = Math.floor(y / LINE_H)
  const tip = i >= 0 && i < tips.length ? (tips[i] || '') : ''
  if (tip !== hoverTip.value) hoverTip.value = tip
}

function clearHoverTip() {
  hoverTip.value = ''
}

/** 点行号 → 选中"这一行的数据"（不含行尾换行） */
function selectLine(i) {
  const ta = taEl.value
  if (!ta) return
  const arr = String(props.modelValue ?? '').split('\n')
  if (i < 0 || i >= arr.length) return
  let start = 0
  for (let k = 0; k < i; k++) start += arr[k].length + 1
  ta.focus()
  ta.setSelectionRange(start, start + arr[i].length)
}

/** 只读态切换（源 ⇄ 中转）时把滚动位置归零：两份内容的行数不同，
 *  留着旧的 scrollTop 会让新内容一进来就"滚到中间"。 */
function resetScroll() {
  scrollTop.value = 0
  clearHoverTip()
  if (taEl.value) taEl.value.scrollTop = 0
}
defineExpose({ resetScroll })

onBeforeUnmount(() => {
  scrollTop.value = 0
  hoverTip.value = ''
})
</script>

<template>
  <div class="lned" :class="{ 'is-readonly': readonly, 'is-toggleable': toggleable }">
    <!-- 行号列：不自己滚动，靠 translateY 跟随 textarea 的滚动量 -->
    <div class="lned__gutter" aria-hidden="true">
      <div class="lned__gutter-inner" :style="{ transform: `translateY(${-scrollTop}px)` }">
        <div
          v-for="(l, i) in lines"
          :key="i"
          class="lned__no"
          :class="{ 'is-off': l.off }"
          :title="l.off ? '该行已停用，不参与复制' : '点击选中该行'"
          @click="selectLine(i)"
        >
          <!-- 停用/启用切换：默认隐形，悬停该行才浮出（停用的行常显）。 -->
          <button
            v-if="toggleable"
            class="lned__toggle"
            type="button"
            :title="l.off ? '启用该行' : '停用该行（不参与复制）'"
            :aria-label="l.off ? `启用第 ${i + 1} 行` : `停用第 ${i + 1} 行`"
            @click.stop="toggleOff(i)"
          >
            <AppIcon :name="l.off ? 'check' : 'ban'" :size="11" />
          </button>
          <span class="lned__num">{{ i + 1 }}</span>
        </div>
      </div>
    </div>

    <div class="lned__main">
      <!-- 停用行的色带。盖在 textarea **之上**但 pointer-events:none， -->
      <div class="lned__bands" aria-hidden="true">
        <span
          v-for="i in offBands"
          :key="i"
          class="lned__band"
          :style="{ top: bandTop(i) }"
        />
      </div>

      <textarea
        ref="taEl"
        class="ui-textarea lned__ta"
        :value="modelValue"
        :readonly="readonly"
        :rows="effectiveRows"
        :placeholder="placeholder"
        :title="hoverTip"
        wrap="off"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        @input="onInput"
        @scroll="onScroll"
        @mousemove="onMouseMove"
        @mouseleave="clearHoverTip"
      />

      <CopyIconButton
        class="lned__copy"
        :text="copyText"
        :title="copyTitle"
        :label="copyLabel"
      />
    </div>
  </div>
</template>

<style scoped>
/* 行高常量：CSS 与 JS 都读它（JS 侧是 LINE_H），改一处必须改另一处 */
.lned {
  --lned-lh: 20px;
  /* 行号列**总宽**（含左右内边距与右边框，因为 .lned__gutter 用 border-box）。
     内容盒宽度 = 总宽 - pad-l - pad-r - 右边框。 */
  --lned-gutter: 40px;
  /* 左右内边距。左边给"停用/启用按钮"让位，右边给"行号右对齐"留呼吸位。
     两边都**不能省**：省了按钮就压在外边框上、行号就压在中缝线上。 */
  --lned-gutter-pad-l: 6px;
  --lned-gutter-pad-r: 4px;
  /** 停用红条宽度（行号列里的竖条） */
  --lned-offbar: 2px;
  /* 上下内边距。**三处（行号列 / 行号列内容 / 文本区）必须一致**，
     否则首行行号与首行文字错位。JS 侧的 PAD_TOP 也是这个值。 */
  --lned-pt: 8px;
  display: flex;
  align-items: stretch;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  background: var(--background);
  overflow: hidden;
}
/* 带切换按钮时加宽：左边放按钮、右边放行号，中间还要留得下 4 位数行号。 */
.lned.is-toggleable {
  --lned-gutter: 62px;
}
/* 聚焦环画在整体外壳上（textarea 自己的边框被去掉，见 .lned__ta） */
.lned:focus-within {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 25%, transparent);
}

/* ---------- 行号列 ---------- */
.lned__gutter {
  flex: none;
  /* 总宽含内边距与边框：宽度好算，也免得"内容盒 + 内边距"溢出外框。 */
  box-sizing: border-box;
  width: var(--lned-gutter);
  /* absolute 的行号列以它为定位基准 */
  position: relative;
  /* 左右留白：左边让出按钮的位置，右边让出停用红条与中缝的呼吸位。 */
  padding: var(--lned-pt) var(--lned-gutter-pad-r) var(--lned-pt) var(--lned-gutter-pad-l);
  overflow: hidden;
  background: var(--muted);
  border-right: 1px solid var(--border);
  user-select: none;
}
.lned__gutter-inner {
  /* 绝对定位：**不撑开行号列的高度**（否则行号列比文本区高，
     会出现"下半截只有行号没有内容"）。超出部分由 gutter 的 overflow 裁掉，
     滚动时靠 translateY 跟随文本区。
     ★ left/right 必须给到内边距处：绝对定位的包含块是**内边距盒**，
     只写 left:0 会让这一层按内容宽度收缩 —— 行号于是挤在左边，
     右侧空出一大片，"行号右对齐"直接落空（这就是截图里的样子）。 */
  position: absolute;
  top: var(--lned-pt);
  left: var(--lned-gutter-pad-l);
  right: var(--lned-gutter-pad-r);
  will-change: transform;
}
.lned__no {
  display: flex;
  align-items: center;
  height: var(--lned-lh);
  line-height: var(--lned-lh);
  font-size: 11px;
  color: var(--muted-foreground);
  cursor: pointer;
  /* 停用红条（::after）的定位基准 */
  position: relative;
}
.lned__num {
  /* 行号**右对齐**：靠 margin-left:auto 顶到行号列右缘。
     不用 justify-content:space-between —— 那一套在没有按钮的只读态下
     会把唯一的孩子推到左边（flex-start），行号反而变成左对齐。 */
  flex: 0 0 auto;
  margin-left: auto;
  /* 与停用红条之间留 2px，数字不压红条。 */
  padding-right: 2px;
  text-align: right;
  font-family: var(--font-mono);
  /* 3 位数起步：位数少时行号列右侧也是齐的，不会左移。 */
  min-width: 3ch;
}
.lned__no:hover { color: var(--foreground); }
/* 停用行：行号染危险色 + 右侧一条 2px 竖条，扫一眼就知道哪几行不参与复制 */
.lned__no.is-off {
  color: var(--destructive);
  font-weight: 600;
}
/* 停用标记。**必须画在 .lned__no 之外**（挪进本列的右侧留白里）：
   画在列内会盖住行号，画在留白最外侧又会顶到中缝的边框上，
   所以落在"留白里侧 2px"——既不压数字，也不压框。 */
.lned__no.is-off::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: calc(-1 * var(--lned-gutter-pad-r) + 2px);
  width: var(--lned-offbar);
  background: var(--destructive);
}

/* ---------- 行号区的停用/启用切换 ---------- */
/* 默认隐形（行号列很窄，常显会让整列全是图标、干扰读行号）；
   悬停该行或该行本身就是停用态时才浮出。 */
.lned__toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 12px（原 14px）：行号列整体缩窄后按钮也得跟着收，否则数字区放不下 4 位数。
     图标仍是 11px —— lucide 的图形不铺满 viewBox，视觉上还有余量。 */
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}
.lned__no:hover .lned__toggle,
.lned__no.is-off .lned__toggle,
.lned__toggle:focus-visible {
  opacity: 1;
}
/* --accent 与 --muted 同值：悬停底色若用 ghost 那套等于压在同一个颜色的面上，
   完全看不出反馈，所以这里自覆盖一层（oklab 混色，深浅两态自动同向）。 */
.lned__toggle:hover {
  background: color-mix(in oklab, var(--foreground) 12%, var(--muted));
  color: var(--foreground);
}
.lned__no.is-off .lned__toggle { color: var(--destructive); }

/* ---------- 编辑区 ---------- */
.lned__main {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
/* textarea 自己不再画边框/焦点环 —— 由 .lned 外壳统一负责，否则 */
.lned__ta {
  display: block;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: var(--lned-pt) 44px var(--lned-pt) 11px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: var(--lned-lh);
  resize: vertical;
  min-height: 78px;
  outline: none;
  box-shadow: none;
  /* 框内不画纵向滚动条：行数已按内容自适应（见 effectiveRows），
     超出上限时靠滚轮滚，行号列同步跟随。 */
  scrollbar-width: none;
}
.lned__ta::-webkit-scrollbar {
  width: 0;
  /* 横向保留：长 URL 还要能往右看 */
  height: 8px;
}
.lned__ta:focus {
  border: 0;
  box-shadow: none;
}
/* 只读态（显示中转地址）：复用**同一个**区块，只是压成灰色不可编辑 */
.lned.is-readonly {
  background: var(--muted);
}
.lned.is-readonly .lned__gutter {
  background: color-mix(in oklab, var(--foreground) 6%, var(--muted));
}
.lned.is-readonly .lned__ta {
  /* readonly 不是 disabled：文字依然可以选中（用户想手动复制就靠它），
     所以用 default 而不是 not-allowed —— 后者会让人以为整块都不给点。 */
  color: var(--muted-foreground);
  cursor: default;
}

/* ---------- 停用行色带 ---------- */
.lned__bands {
  position: absolute;
  inset: 0; /* .lned__main 没有边框，正文区顶边 = padding-top，两者同原点 */
  overflow: hidden;
  pointer-events: none;
}
.lned__band {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--lned-lh);
  background: color-mix(in oklab, var(--destructive) 10%, transparent);
}

/* ---------- 右上角的复制按钮 ---------- */
.lned__copy {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
