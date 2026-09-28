<script setup>
// 系统公告 —— 重构自 admin_notice.html。
// 位置：客户端设置页**第一个标签**的最下面一张卡片（/admin/client）——
// 与骆驼客户端设置同一屏、上下堆叠。公告的内容就是客户端启动时弹出的……
import { ref, onMounted, computed } from 'vue'
import { post } from '@/api/http'
import { submitAction } from '@/utils/page'
import { API, CLIENT_ROUTES } from '@/api/endpoints'

const data = ref(null)
const loading = ref(false)
const form = ref({ adText: '', showTime: '', showInterval: '' })

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminClientNoticeData)
    const ad = data.value?.ad || {}
    form.value = {
      adText: ad.adText ?? '',
      showTime: ad.showTime ?? '',
      showInterval: ad.showInterval ?? '',
    }
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

async function save() {
  await submitAction(
    CLIENT_ROUTES.noticeSave,
    {
      adText: form.value.adText,
      showTime: Number(form.value.showTime) || 0,
      showInterval: Number(form.value.showInterval) || 0,
    },
    { reload: load }
  )
}
</script>

<template>
  <div class="ui-card">
    <div class="ui-card__header"><h4>系统公告</h4></div>
    <div class="ui-card__body">
      <div v-if="loading" class="ui-alert ui-alert--info">
        <span class="ui-spinner" />正在加载公告…
      </div>

      <!-- 取数完成前不渲染表单 —— 否则先输入的内容会被回填覆盖，看起来像"输入被吞了" -->
      <template v-else>
        <div class="ui-field">
          <label class="ui-field__label">系统公告</label>
          <textarea v-model="form.adText" class="ui-textarea" rows="5" placeholder="请输入公告内容" />
        </div>

        <div class="ui-field" style="max-width: 320px">
          <label class="ui-field__label">显示时间（秒）</label>
          <input v-model="form.showTime" class="ui-input" type="number" min="0" @keyup.enter="save" />
        </div>

        <div class="ui-field" style="max-width: 320px">
          <label class="ui-field__label">显示间隔（分）</label>
          <input v-model="form.showInterval" class="ui-input" type="number" min="0" @keyup.enter="save" />
        </div>

        <button class="ui-btn ui-btn--primary" type="button" @click="save">确认提交</button>
      </template>
    </div>
  </div>
</template>
