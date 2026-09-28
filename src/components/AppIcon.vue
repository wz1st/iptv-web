<script setup>
// 图标组件 —— 语义名 → lucide 图标。
import {
  Home, Package, CalendarClock, Tv, MonitorSmartphone, Settings, Info,
  LogOut, User, Download, KeyRound, Palette, Sun, Moon, Menu,
  TrendingUp, TrendingDown, Trash2, Pencil, Plus, RefreshCw, Search,
  Folder, Film, ShieldCheck, ClipboardList, Copy, ExternalLink, Check,
  GripVertical, ImagePlus, Ban,
} from 'lucide-vue-next'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
})

const ICONS = {
  home: Home,
  meal: Package,
  epg: CalendarClock,
  tv: Tv,
  device: MonitorSmartphone,
  settings: Settings,
  info: Info,
  logout: LogOut,
  user: User,
  download: Download,
  key: KeyRound,
  palette: Palette,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  up: TrendingUp,
  down: TrendingDown,
  delete: Trash2,
  edit: Pencil,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  folder: Folder,
  film: Film,
  shield: ShieldCheck,
  clipboard: ClipboardList,
  // 订阅行末尾那两个图标按钮用的（见 views/admin/MealsView.vue）。
  copy: Copy,
  external: ExternalLink,
  /* 复制类按钮的"已复制"态（见 views/admin/MealsView.vue 的复制图标） */
  check: Check,
  // 拖拽手柄（频道分组 / EPG管理两张表都用它）。
  grip: GripVertical,
  /* 台标上传的占位图标（EPG列表 / EPG管理 的 logo 列） */
  image: ImagePlus,
  // 「停用」——频道编辑器的行号区用它做切换按钮（配合 check 表示"启用"）。
  // 注意别拿它当"删除"：删除是 delete(Trash2) / 行内的 ×。
  ban: Ban,
}

/** 认不出的名字回落到 info —— 与上一版行为一致：宁可画错一个图标，不要整块渲染不出来 */
const icon = () => ICONS[props.name] || Info
</script>

<template>
  <component :is="icon()" :size="size" style="flex: none" />
</template>
