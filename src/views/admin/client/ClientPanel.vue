<script setup>
// 客户端设置 —— 双壳 tab 容器：
//   清和壳 = Client.apk 那套（/api/client，基底 client/Client.apk）
//   骆驼壳 = 独立基底 Client_lt.apk 那套（/api/client/lt）
// 两个壳共用同一套编译接口（BuildClientApk），只是基底、版本文件、下载地址各自独立；
// 产物文件名也各自带壳标记（<应用名>-qh / <应用名>-lt），同名也不会互相覆盖。
// 实际的编译/发布/基底管理逻辑都下放到 ClientShellPanel（按 shell 挑路由）。
//
// 标签条统一用 AdminTabs —— 与「设备管理」「EPG管理」等同款分段控件。
// 不再自己写一套按钮式 ui-tab：同一个后台里两种标签外观，会被当成两种不同的东西。
//
// **默认展示清和壳** —— 安装完成后自动编的就是它（spaSiteApi.go 的 InstallData
// 只 `go bootstrap.BuildAPK(false)`），也就是说用户第一次进这个页面时，
// 只有清和壳那一栏有现成的包可发布/下载；默认落在骆驼壳会让页面一进来就是
// "还没编译"的空态。所以清和壳排在第一个并且是默认选中项。
//
// 注意这与公开下载页的字段归属**刻意不同**：下载页的 `apk_*` 三个占位符
// （apk_url/apk_name/show_down）仍然归骆驼壳，清和壳用 `apk_qh_*`。
// 那两个名字是用户在站点模板里写死的对外契约，不能因为这里的默认值而改。
import { ref } from 'vue'
import AdminTabs from '@/components/AdminTabs.vue'
import ClientShellPanel from './ClientShellPanel.vue'

// 顺序即标签顺序；第一项同时是"路径兜底"与默认选中项。
// 图标与背景也是各自一套（清和壳 /config/images/{icon,bj}、骆驼壳
// /config/images/lt/*），所以在哪个 tab 上传的图只会进哪个壳的包。
const TABS = [
  { key: 'qinghe', label: '清和壳', hint: 'Client.apk 那套基底：编译、待发布、发布、基底与图标背景' },
  { key: 'lt', label: '骆驼壳', hint: '独立基底 Client_lt.apk 那套，编译与图标背景都与清和壳各自独立' },
]

// 'qinghe' = 清和壳（默认）；'lt' = 骆驼壳。这里不落 URL，所以直接存一个 ref。
const tab = ref(TABS[0].key)
</script>

<template>
  <div>
    <AdminTabs :tabs="TABS" :active="tab" @change="tab = $event" />

    <!-- 每个 tab 各自挂载一个 ClientShellPanel 实例：状态隔离，切回时重新取数 -->
    <div class="ui-tabpanes">
      <ClientShellPanel v-if="tab === 'qinghe'" shell="qinghe" />
      <ClientShellPanel v-else shell="lt" />
    </div>
  </div>
</template>
