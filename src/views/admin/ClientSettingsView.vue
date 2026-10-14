<script setup>
// 客户端设置 —— 骆驼壳 / 清和壳双壳 + 定制APK（custom 独有）+ MyTV。
// 「应用默认设置 / 应用提示 / 系统公告」已搬到 设备管理 → 下发设置（/admin/deliver）。
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminTabs from '@/components/AdminTabs.vue'
import ClientPanel from './client/ClientPanel.vue'
import ClientMyTVPanel from './client/ClientMyTVPanel.vue'
import ClientCustomPanel from './client/ClientCustomPanel.vue'
// 公告已搬到 设备管理 → 下发设置（/admin/deliver），这里不再import
import { isLic, isCustom } from '@/utils/site'

const route = useRoute()
const router = useRouter()

const TABS = computed(() => {
  const list = [
    {
      key: 'client',
      label: '客户端设置',
      path: '/admin/client',
      hint: 'APK 连接地址、应用名、图标背景、编译与发布、基底升级',
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
  // 定制APK：只有定制授权（dao.License.Type == 4）才出现。
  // 与 mytv 那个标签是刻意做减法：无出厂基底、无在线升级、上传不校验包名。
  if (isCustom.value) {
    list.push({
      key: 'custom',
      label: '定制APK',
      path: '/admin/clientCustom',
      hint: '定制版 APK 的版本与更新内容（连接地址与 MyTV 共用）',
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
      <!-- 客户端标签只剩「编译配置」一块。
           应用默认设置 / 应用提示 / 系统公告已搬到**设备管理 → 下发设置**
           （/admin/deliver，见 DeliverSettingsPanel）—— 那三块是运行期
           下发的配置，改完不必重新编译 APK，挤在编译表单旁容易让人误以为要重编。 -->
      <template v-if="active === 'client'">
        <ClientPanel />
      </template>
      <!-- MyTV 标签：与清和同一套「编译 → 待发布 → 发布」流程，
           编译在引擎里执行，连接地址与 apk 均独立于清和。 -->
      <ClientMyTVPanel v-else-if="active === 'mytv'" />
      <!-- 定制APK 标签：同为「编译 → 待发布 → 发布」，编译也在引擎里，
           但取消出厂基底 / 在线升级 / 包名检查，连接地址与 mytv 共用。 -->
      <ClientCustomPanel v-else />
    </div>
  </div>
</template>
