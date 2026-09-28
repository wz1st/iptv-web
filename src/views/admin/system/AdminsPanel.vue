<script setup>
// 管理员设置 —— 重构自 admin_admins.html。
import { ref, onMounted } from 'vue'
import { post } from '@/api/http'
import { submitAction } from '@/utils/page'
import { notify } from '@/utils/feedback'
import { API, ROUTES } from '@/api/endpoints'

const data = ref(null)
const loading = ref(false)
const form = ref({ username: '', oldPassword: '', newPassword: '', newPassword2: '' })

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminAdminsData)
    // 后端回填当前管理员名（原模板硬编码 value="admin"）
    if (data.value?.admins?.length) {
      form.value.username = data.value.admins[0].username || 'admin'
    } else {
      form.value.username = 'admin'
    }
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

async function save() {
  if (!form.value.username) { notify('请输入用户名', 'warning'); return }
  if (form.value.newPassword && form.value.newPassword !== form.value.newPassword2) {
    notify('两次输入的新密码不一致', 'danger')
    return
  }

  await submitAction(
    ROUTES.admins,
    {
      username: form.value.username,
      oldPassword: form.value.oldPassword,
      newPassword: form.value.newPassword,
      newPassword2: form.value.newPassword2,
    },
    {
      reload: async () => {
        form.value.oldPassword = ''
        form.value.newPassword = ''
        form.value.newPassword2 = ''
        await load()
      },
    }
  )
}
</script>

<template>
  <div class="ui-card">
    <div class="ui-card__header"><h4>修改管理员信息</h4></div>
    <div class="ui-card__body">
      <div v-if="loading" class="ui-alert ui-alert--info">
        <span class="ui-spinner" />正在加载管理员信息…
      </div>

      <!-- 取数完成前不渲染表单，避免回填把用户已输入的内容覆盖掉 -->
      <template v-else>
        <div class="ui-field" style="max-width: 420px">
          <label class="ui-field__label">用户名</label>
          <input v-model="form.username" class="ui-input" type="text" />
        </div>

        <div class="ui-field" style="max-width: 420px">
          <label class="ui-field__label">旧密码</label>
          <input v-model="form.oldPassword" class="ui-input" type="password" autocomplete="current-password" />
        </div>

        <div class="ui-field" style="max-width: 420px">
          <label class="ui-field__label">新密码</label>
          <input v-model="form.newPassword" class="ui-input" type="password" autocomplete="new-password" />
        </div>

        <div class="ui-field" style="max-width: 420px">
          <label class="ui-field__label">确认新密码</label>
          <input
            v-model="form.newPassword2"
            class="ui-input"
            type="password"
            autocomplete="new-password"
            @keyup.enter="save"
          />
        </div>

        <button class="ui-btn ui-btn--primary" type="button" @click="save">修改信息</button>
        <small class="ui-help">提示：密码为空保留原密码。</small>
      </template>
    </div>
  </div>
</template>
