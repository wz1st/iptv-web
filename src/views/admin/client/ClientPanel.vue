<script setup>
// 客户端设置 —— 双壳 tab 容器：
//   骆驼壳 = client/smali 树编出来的那套（/api/client/lt，主槽位，基底 client/Client_lt.apk）
//   清和壳 = Client.apk 那套（/api/client，基底 client/Client.apk）
// 两个壳共用同一套编译接口（BuildClientApk），只是基底、版本文件、下载地址各自独立。
// 实际的编译/发布/基底管理逻辑都下放到 ClientShellPanel（按 shell 挑路由）。
//
// **主槽位是骆驼壳**，所以它排在第一个并且是默认选中项 ——
// tab 顺序与下载页按钮顺序、`{APK_URL}` 占位符的归属三处必须一致，
// 否则用户从一个页面推断出的是另一件事。
import { ref } from 'vue'
import ClientShellPanel from './ClientShellPanel.vue'

const tab = ref('lt') // 'lt' = 骆驼壳（smali 树，主槽位）；'qinghe' = 清和壳（Client.apk）
</script>

<template>
  <div>
    <div class="ui-tabs">
      <button class="ui-tab" :class="{ 'is-active': tab === 'lt' }" type="button" @click="tab = 'lt'">
        骆驼壳
      </button>
      <button class="ui-tab" :class="{ 'is-active': tab === 'qinghe' }" type="button" @click="tab = 'qinghe'">
        清和壳
      </button>
    </div>

    <!-- 每个 tab 各自挂载一个 ClientShellPanel 实例：状态隔离，切回时重新取数 -->
    <ClientShellPanel v-if="tab === 'lt'" shell="lt" />
    <ClientShellPanel v-else shell="qinghe" />
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
