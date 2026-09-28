<script setup>
// EPG 管理 —— 把原来的「EPG来源」与「EPG列表」两个页面合并成一页两个标签。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import EpgFromPanel from './epg/EpgFromPanel.vue'
import EpgsPanel from './epg/EpgsPanel.vue'

const route = useRoute()
const router = useRouter()

const TABS = [
  { key: 'from', label: 'EPG来源', path: '/admin/epgFrom', hint: '配置EPG数据源，并从源站抓取节目单' },
  { key: 'list', label: 'EPG列表', path: '/admin/epgsList', hint: '管理EPG、绑定频道、上传台标' },
]

// 选中态**只**来自路径。不再另存一个 ref，否则"菜单高亮/标签高亮/URL"
// 三处状态就会各说各话（这类不同步在改造前的老页面上很常见）。
const active = computed(() => {
  const hit = TABS.find((t) => t.path === route.path)
  return hit ? hit.key : TABS[0].key
})

function onChange(key) {
  const hit = TABS.find((t) => t.key === key)
  if (hit && hit.path !== route.path) router.push(hit.path)
}
</script>

<template>
  <div>
    <AdminTabs :tabs="TABS" :active="active" @change="onChange" />
    <!-- 面板用 v-if 切换而不是 KeepAlive：切走即卸载、切回重新取数。 -->
    <div class="ui-tabpanes">
      <EpgFromPanel v-if="active === 'from'" />
      <EpgsPanel v-else />
    </div>
  </div>
</template>
