<script setup>
// 客户端设置 —— 双壳 tab 容器：
//   清和壳 = Client.apk 那套（/api/client，基底 client/Client.apk）
//   骆驼壳 = 独立基底 Client_lt.apk 那套（/api/client/lt）
// 两个壳共用同一套编译接口（BuildClientApk），只是基底、版本文件、下载地址各自独立；
// 产物文件名也各自带壳标记（<应用名>-qh / <应用名>-lt），同名也不会互相覆盖。
// 实际的编译/发布/基底管理逻辑都下放到 ClientShellPanel（按 shell 挑路由）。
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
import ClientShellPanel from './ClientShellPanel.vue'

const tab = ref('qinghe') // 'qinghe' = 清和壳（默认）；'lt' = 骆驼壳
</script>

<template>
  <div>
    <div class="ui-tabs">
      <button class="ui-tab" :class="{ 'is-active': tab === 'qinghe' }" type="button" @click="tab = 'qinghe'">
        清和壳
      </button>
      <button class="ui-tab" :class="{ 'is-active': tab === 'lt' }" type="button" @click="tab = 'lt'">
        骆驼壳
      </button>
    </div>

    <!-- 每个 tab 各自挂载一个 ClientShellPanel 实例：状态隔离，切回时重新取数 -->
    <ClientShellPanel v-if="tab === 'qinghe'" shell="qinghe" />
    <ClientShellPanel v-else shell="lt" />
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.ui-tab {
  padding: 8px 18px;
  border: 1px solid var(--c-border, #d0d5dd);
  background: var(--c-card, #fff);
  color: var(--c-text, #333);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.ui-tab.is-active {
  background: var(--primary, #2f6fed);
  color: #fff;
  border-color: var(--primary, #2f6fed);
}
</style>
