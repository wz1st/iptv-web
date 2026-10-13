<script setup>
// 客户端设置 —— 双壳 tab 容器：
//   骆驼壳 = client/smali 树编出来的那套（/api/client/lt，主槽位，基底 client/Client_lt.apk）
//   清和壳 = Client.apk 那套（/api/client，基底 client/Client.apk）
// 两个壳共用同一套编译接口（BuildClientApk），只是基底、版本文件、下载地址各自独立。
// 实际的编译/发布/基底管理逻辑都下放到 ClientShellPanel（按 shell 挑路由）。
//
// 标签条统一用 AdminTabs —— 与「设备管理」「EPG管理」等同款分段控件。
// 不再自己写一套按钮式 ui-tab：同一个后台里两种标签外观，会被当成两种不同的东西。
//
// **主槽位是骆驼壳**，所以它排在第一个并且是默认选中项 ——
// tab 顺序与下载页按钮顺序、`{APK_URL}` 占位符的归属三处必须一致，
// 否则用户从一个页面推断出的是另一件事。
//
// 注意这与公开下载页的字段归属**刻意不同**：下载页的 `apk_*` 三个占位符
// （apk_url/apk_name/show_down）仍然归骆驼壳，清和壳用 `apk_qh_*`。
// 那两个名字是用户在站点模板里写死的对外契约，不能因为这里的默认值而改。
import { ref } from 'vue'
import AdminTabs from '@/components/AdminTabs.vue'
import ClientShellPanel from './ClientShellPanel.vue'

// 顺序即标签顺序；第一项同时是"路径兜底"与默认选中项。
// 顺序即标签顺序；第一项同时是"路径兜底"与默认选中项。
// ★custom 的主槽位是**骆驼壳**（与下载页按钮顺序、{APK_URL} 归属三处一致），
//   所以骆驼壳排在第一个并且默认选中 —— 这点与 main 相反，是定制分支的有意差异。
// 图标与背景也是各自一套（清和壳 /config/images/{icon,bj}、骆驼壳
// /config/images/lt/*），所以在哪个 tab 上传的图只会进哪个壳的包。
const TABS = [
  { key: 'lt', label: '骆驼壳', hint: '独立基底 Client_lt.apk 那套：编译、待发布、发布、图标背景与基底管理' },
  { key: 'qinghe', label: '清和壳', hint: 'Client.apk 那套基底，与骆驼壳各自独立编译' },
]
]

// 这里不落 URL（不是路由级标签），所以直接存一个 ref。
const tab = ref(TABS[0].key)
</script>

<template>
  <div>
    <AdminTabs :tabs="TABS" :active="tab" @change="tab = $event" />

    <!-- 每个 tab 各自挂载一个 ClientShellPanel 实例：状态隔离，切回时重新取数 -->
    <div class="ui-tabpanes">
      <!-- 主槽位是骆驼壳，排在第一个且默认选中（与下载页按钮顺序一致） -->
      <ClientShellPanel v-if="tab === 'lt'" shell="lt" />
      <ClientShellPanel v-else shell="qinghe" />
    </div>
  </div>
</template>
