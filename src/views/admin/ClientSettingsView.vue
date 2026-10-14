<script setup>
// 客户端设置 —— 只剩「客户端设置（骆驼壳 / 清和壳双壳）」的编译相关配置。
// 系统公告与「应用默认设置 / 应用提示」已搬到 设备管理 → 下发设置（/admin/deliver）。
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import ClientShellPanel from './client/ClientShellPanel.vue'
import ClientMyTVPanel from './client/ClientMyTVPanel.vue'
import { isLic } from '@/utils/site'

const route = useRoute()
const router = useRouter()

const TABS = computed(() => {
  // ★ 三个标签**同一行**：清和壳 / 骆驼壳 / MyTV客户端。
  // 原来清和壳与骆驼壳是「客户端设置」这一格里的第二行标签（ClientPanel.vue 内
  // 自己的 ref），看着像两级菜单、点一下才展开，实际是并列的两项 ——
  // 合成一行后层级少一层，也不用为"在内层切到骆驼壳"单独设计状态。
  //
  // ★主线（main）：**清和壳优先** —— 排第一个且占 /admin/client
  //   （安装完成后自动编的就是它，见 spaSiteApi.InstallData 编的是清和壳）。
  //   custom 分支相反（那边骆驼壳优先）—— 两边主槽位不同，刻意不一致。
  const list = [
    {
      key: 'qh',
      label: '清和壳',
      path: '/admin/client',
      hint: '清和壳（Client.apk 基底）：连接地址、应用名、图标背景、编译与发布、基底升级',
    },
    {
      key: 'lt',
      label: '骆驼壳',
      path: '/admin/clientLt',
      hint: '骆驼壳（Client_lt.apk 基底）：与清和壳各自独立编译、发布、图标背景',
    },
  ]
  if (isLic.value) {
    list.push({
      key: 'mytv',
      label: 'MyTV客户端',
      path: '/admin/clientMyTV',
      hint: 'MyTV 版 APK 的版本与更新内容',
    })
  }
  return list
})

const active = computed(() => {
  const hit = TABS.value.find((t) => t.path === route.path)
  return hit ? hit.key : TABS.value[0].key
})

const showTabs = computed(() => TABS.value.length > 1)

// 直接打开一个当前不可用的路径（例如未授权却访问 /admin/clientMyTV）时，
onMounted(() => {
  if (!TABS.value.some((t) => t.path === route.path)) router.replace(TABS.value[0].path)
})

function onChange(key) {
  const hit = TABS.value.find((t) => t.key === key)
  if (hit && hit.path !== route.path) router.push(hit.path)
}
</script>

<template>
  <div>
    <AdminTabs v-if="showTabs" :tabs="TABS" :active="active" @change="onChange" />
    <!-- 面板用 v-if 切换而不是 KeepAlive：切走即卸载、切回重新取数。
         标签条隐藏时不要再留 16px 上边距（那是给标签条让位的）。 -->
    <div :class="{ 'ui-tabpanes': showTabs }">
      <!-- 两个壳都用 ClientShellPanel，按 shell 挑路由（各自一套编译/发布/素材）。
           ★ 原来这里是 <ClientPanel />（它自己再带一层标签），
             那层标签已提升到本页，与 MyTV 并列成一行。
           「应用默认设置 / 应用提示 / 系统公告」在**设备管理 → 下发设置**
           （/admin/deliver，见 DeliverSettingsPanel）—— 那三块是运行期
           下发的配置，改完不必重新编译 APK。 -->
      <ClientShellPanel v-if="active === 'qh'" shell="qinghe" />
      <ClientShellPanel v-else-if="active === 'lt'" shell="lt" />
      <!-- MyTV 标签：与客户端面板同一套「编译 → 待发布 → 发布」流程，
           编译在引擎里执行，连接地址与 apk 均独立。 -->
      <ClientMyTVPanel v-else />
    </div>
  </div>
</template>
