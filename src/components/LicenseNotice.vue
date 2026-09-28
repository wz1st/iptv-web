<script setup>
// 未授权提示 —— 挂在后台布局上，**每次登录后弹一次**（2026-09-23 第二轮调整）。
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppModal from '@/components/AppModal.vue'
import { isLic, licLogged } from '@/utils/site'
import { hasSeenLicenseNotice, markLicenseNoticeSeen } from '@/utils/licenseNotice'

const route = useRoute()
const router = useRouter()

const show = ref(false)

// 授权后能用到的功能 —— 文案与进阶功能页那四张卡一一对应，
const FEATURES = [
  { name: '中转访问', desc: '单播转组播，并把不同源里的 CCTV1、CCTV2 等聚合成新分组。' },
  { name: '分辨率与延迟测试', desc: '自动或手动测出每个频道的画质与延迟，并可按结果自动禁用失效源。' },
  { name: 'EPG 模糊识别', desc: '频道名与节目单对不上时按模糊匹配兜底，提高自动绑定成功率。' },
  { name: '短订阅链接', desc: '更短的订阅地址，方便在电视遥控器上输入。' },
]

/** 弹出并记标记（两个入口共用，避免漏记导致刷新又弹）。 */
function popup() {
  show.value = true
  markLicenseNoticeSeen()
}

onMounted(() => {
  if (isLic.value) return
  // 授权账号已登录 → 不弹（需求：「登录到系统时，如果授权账号已经登录也不弹出」）。
  // 此时用户的动作应当是"继续用/更新授权"，而不是被提示"去登录授权账号"。
  if (licLogged.value) return
  if (hasSeenLicenseNotice()) return
  if (route.path === '/admin/engine') return
  popup()
})

// 使用过程中掉了授权 → 补弹一次。
watch(isLic, (now, before) => {
  if (now || !before) return
  if (show.value) return
  if (route.path === '/admin/engine') return
  popup()
})

function goEngine() {
  show.value = false
  router.push('/admin/engine')
}
</script>

<template>
  <AppModal v-model="show" title="进阶功能尚未授权" size="lg">
    <p class="lic-note__lead">
      当前系统没有有效的授权账号，下面这些功能暂不可用。授权后可以享受：
    </p>

    <ul class="lic-note__list">
      <li v-for="f in FEATURES" :key="f.name" class="lic-note__item">
        <strong class="lic-note__name">{{ f.name }}</strong>
        <span class="lic-note__desc">{{ f.desc }}</span>
      </li>
    </ul>

    <small class="ui-help ui-help--ink">
      在「进阶功能」里注册并登录授权账号即可开通，首次登录可获得一天试用时长。
    </small>

    <template #footer>
      <button class="ui-btn" type="button" @click="show = false">暂不授权</button>
      <button class="ui-btn ui-btn--primary" type="button" @click="goEngine">前往进阶功能</button>
    </template>
  </AppModal>
</template>

<style scoped>
.lic-note__lead { margin: 0 0 10px; font-size: 13px; }
.lic-note__list { margin: 0 0 10px; padding: 0; list-style: none; }
.lic-note__item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 4px 0;
  font-size: 13px;
  line-height: 1.5;
}
.lic-note__name {
  flex: 0 0 auto;
  min-width: 132px;
  color: var(--foreground);
}
.lic-note__desc { color: var(--foreground); }
</style>
