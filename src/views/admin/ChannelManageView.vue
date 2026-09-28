<script setup>
// 频道管理 —— 把原来上下两块的一屏拆成一页两个标签。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import ChannelsPanel from './channel/ChannelsPanel.vue'

const route = useRoute()
const router = useRouter()

// 顺序即标签顺序；TABS[0] 同时是"路径不在表里时的兜底"。
const TABS = [
  { key: 'group', label: '频道分组', path: '/admin/channels', hint: '分组增删改与排序、频道与 EPG 维护、测分辨率' },
  { key: 'source', label: '频道源设置', path: '/admin/channelsSource', hint: '外部订阅列表的增删改与更新间隔' },
]

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
    <div class="ui-tabpanes">
      <ChannelsPanel :key="active" :section="active" />
    </div>
  </div>
</template>
