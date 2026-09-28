<script setup>
// 设备管理 —— 把「设备列表」与「设备授权」合并成一页两个标签。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import UsersPanel from './client/UsersPanel.vue'
import AuthorsPanel from './client/AuthorsPanel.vue'

const route = useRoute()
const router = useRouter()

// 顺序即标签顺序；TABS[0] 同时是"路径不在表里时的兜底"。
const TABS = [
  { key: 'users', label: '设备列表', path: '/admin/users', hint: '已授权客户端的套餐、状态、备注与批量操作' },
  { key: 'authors', label: '设备授权', path: '/admin/authors', hint: '待授权设备的授权、禁止试用与记录清理' },
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
      <UsersPanel v-if="active === 'users'" />
      <AuthorsPanel v-else />
    </div>
  </div>
</template>
