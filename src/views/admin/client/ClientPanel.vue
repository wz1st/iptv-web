<script setup>
// 客户端设置 —— 双壳 tab 容器：骆驼壳（原 ez 基底，/api/client）与 清和壳（/api/client/qh）。
// 两个壳共用同一套编译接口（BuildClientApk），只是基底、版本文件、下载地址各自独立。
// 实际的编译/发布/基底管理逻辑都下放到 ClientShellPanel（按 shell 挑路由）。
import { ref } from 'vue'
import ClientShellPanel from './ClientShellPanel.vue'

const tab = ref('luotuo') // 'luotuo' = 骆驼壳（原 ez）；'qh' = 清和壳
</script>

<template>
  <div>
    <div class="ui-tabs">
      <button class="ui-tab" :class="{ 'is-active': tab === 'luotuo' }" type="button" @click="tab = 'luotuo'">
        骆驼壳
      </button>
      <button class="ui-tab" :class="{ 'is-active': tab === 'qh' }" type="button" @click="tab = 'qh'">
        清和壳
      </button>
    </div>

    <!-- 每个 tab 各自挂载一个 ClientShellPanel 实例：状态隔离，切回时重新取数 -->
    <ClientShellPanel v-if="tab === 'luotuo'" shell="luotuo" />
    <ClientShellPanel v-else shell="qh" />
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
