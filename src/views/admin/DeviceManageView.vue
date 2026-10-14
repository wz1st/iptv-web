<script setup>
// 设备管理 —— 「设备列表 / 设备授权 / 下发设置」三个标签。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import UsersPanel from './client/UsersPanel.vue'
import AuthorsPanel from './client/AuthorsPanel.vue'
import DeliverSettingsPanel from './client/DeliverSettingsPanel.vue'

const route = useRoute()
const router = useRouter()

// 顺序即标签顺序；TABS[0] 同时是"路径不在表里时的兜底"。
const TABS = [
  { key: 'users', label: '设备列表', path: '/admin/users', hint: '已授权客户端的套餐、状态、备注与批量操作' },
  { key: 'authors', label: '设备授权', path: '/admin/authors', hint: '待授权设备的授权、禁止试用与记录清理' },
  // 「下发设置」从客户端设置页搬来：解码/缓冲/授权开关、提示语、开机公告。
  // 放这儿是因为它们都是**运行期下发**给客户端的配置（改一句提示语不必重编 APK），
  // 与"编译一个包"是两件事，挤在编译表单旁容易让人误以为要重新编译。
  { key: 'deliver', label: '下发设置', path: '/admin/deliver', hint: '解码与缓冲、客户端授权、提示语与开机公告（改完即时生效，无需重编）' },
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
      <AuthorsPanel v-else-if="active === 'authors'" />
      <DeliverSettingsPanel v-else />
    </div>
  </div>
</template>
