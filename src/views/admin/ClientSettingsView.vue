<script setup>
// 客户端设置 —— 一个标签里放下「骆驼客户端设置 + 系统公告」。
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import ClientPanel from './client/ClientPanel.vue'
import ClientMyTVPanel from './client/ClientMyTVPanel.vue'
import NoticePanel from './client/NoticePanel.vue'
import { isLic } from '@/utils/site'

const route = useRoute()
const router = useRouter()

const TABS = computed(() => {
  const list = [
    {
      key: 'client',
      label: '客户端设置',
      path: '/admin/client',
      hint: '应用信息、图标背景、默认设置、提示语与开机公告',
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
      <!-- 两个面板同属一个标签：各自取数、各自成卡，堆叠成一屏设置项 -->
      <template v-if="active === 'client'">
        <ClientPanel />
        <NoticePanel />
      </template>
      <!-- MyTV 标签：与骆驼同一套「编译 → 待发布 → 发布」流程，
           编译在引擎里执行，连接地址与 apk 均独立于骆驼。 -->
      <ClientMyTVPanel v-else />
    </div>
  </div>
</template>
