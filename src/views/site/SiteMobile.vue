<script setup>
// 官网下载页（移动端）—— 重构自 mobile.html。
import { ref, onMounted } from 'vue'
import { siteName } from '@/utils/site'

const dto = ref({
  show_down: false,
  apk_url: '',
  apk_name: '',
  // 清和壳：服务端并行提供两个壳，下载页要分别给按钮（字段见 dto.IndexDto）。
  // 主槽位是骆驼壳，所以它占用 apk_* 这三个沿用下来的字段。
  show_down_qh: false,
  apk_qh_url: '',
  apk_qh_name: '',
  show_down_mytv: false,
  mytv_url: '',
  mytv_name: '',
})

onMounted(async () => {
  try {
    const res = await fetch('/api/site/index', { credentials: 'same-origin' })
    if (res.ok) Object.assign(dto.value, await res.json())
  } catch { /* 静默降级 */ }
})

/** 静态图走运行时绑定，避免 Vite 把 / 开头路径当模块解析（文件由 Go embed static 提供） */
const img = {
  wrapperonemobilebg: '/static/images/wrapperonemobilebg.jpg',
  wrapthreemobilebg: '/static/images/wrapthreemobilebg.jpg',
  wrapfourmobilebg: '/static/images/wrapfourmobilebg.jpg',
}
</script>

<template>
  <div class="m">
    <section class="m__hero">
      <img class="m__bg" :src="img.wrapperonemobilebg" alt="" />
      <div class="m__actions">
        <a v-if="dto.show_down" class="m__btn m__btn--primary" :href="dto.apk_url" :download="dto.apk_name">
          {{ dto.apk_name }}（骆驼壳）
        </a>
        <a
          v-if="dto.show_down_qh"
          class="m__btn m__btn--secondary"
          :href="dto.apk_qh_url"
          :download="dto.apk_qh_name"
        >
          {{ dto.apk_qh_name }}（清和壳）
        </a>
        <a v-if="dto.show_down_mytv" class="m__btn m__btn--mytv" :href="dto.mytv_url" :download="dto.mytv_name">
          {{ dto.mytv_name }}（MyTV）
        </a>
        <a class="m__btn m__btn--ghost" href="/admin">{{ siteName }}</a>
      </div>
    </section>

    <section class="m__pic"><img :src="img.wrapthreemobilebg" alt="" /></section>
    <section class="m__pic"><img :src="img.wrapfourmobilebg" alt="" /></section>
  </div>
</template>

<style scoped>
.m { background: #fff; }
.m__hero { position: relative; }
.m__bg { width: 100%; display: block; }
.m__actions {
  display: flex; flex-direction: column; gap: 10px;
  padding: 18px 22px 24px;
}
.m__btn {
  display: block; padding: 12px 18px; border-radius: 24px;
  text-align: center; font-size: 15px; font-weight: 600;
  text-decoration: none;
}
.m__btn--primary { background: #2563eb; color: #fff; }
.m__btn--secondary { background: #0891b2; color: #fff; }
/* MyTV 原用 --secondary，那个位置现在给了清和壳 —— 相邻两个按钮同色会让
   「我要下哪个客户端」失去区分度，所以单给一档绿色。 */
.m__btn--mytv { background: #059669; color: #fff; }
.m__btn--ghost { background: #fff; color: #2563eb; border: 1px solid #bfdbfe; }
.m__pic img { width: 100%; display: block; }
</style>
