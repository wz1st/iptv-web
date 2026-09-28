<script setup>
// 后台登录页 —— 版式对齐 One-KVM 的 LoginView（点阵底 + 居中小卡片）。
import { onMounted, ref } from 'vue'
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-vue-next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import BrandMark from '@/components/BrandMark.vue'
import { API } from '@/api/endpoints'
import { jsonPost } from '@/utils/request'
import { siteName } from '@/utils/site'
import { clearLicenseNoticeSeen } from '@/utils/licenseNotice'

/** 上次勾选「记住7天」时留下的用户名（key 与旧版 jquery.cookie 行为对齐） */
const LS_LAST_USER = 'iptv-last-user'

const username = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const year = new Date().getFullYear()

onMounted(() => {
  const saved = localStorage.getItem(LS_LAST_USER)
  if (!saved) return
  username.value = saved
  // 用户名能存下来，说明上次就是勾着「记住7天」提交的，勾选框跟着还原，
  // 否则用户一提交就把记住的用户名抹掉了。
  remember.value = true
})

async function submit() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const res = await jsonPost(API.adminLogin, {
      username: username.value,
      password: password.value,
      remember: remember.value,
    })

    if (res.code === 1) {
      if (remember.value) localStorage.setItem(LS_LAST_USER, username.value)
      else localStorage.removeItem(LS_LAST_USER)
      // 清掉"授权提示已弹过"的会话标记：本次登录理应重新看到一次授权状态
      // 提示（见 utils/licenseNotice.js 的口径说明）。
      clearLicenseNoticeSeen()
      // 整页跳转而不是 router.push：登录后要换一套路由表（安装态/权限
      // 都由后端门禁决定），刷新一次最省心，也与旧版行为一致。
      window.location.href = '/admin/'
      return
    }

    error.value = res.msg || '登录失败'
  } catch (e) {
    error.value = e?.message || '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- data-page 是给 .deploy/ui_smoke.py 的"这是登录页"判据（会话失效检测），
       别删：它原来的判据是旧版自绘表单的 .login__form，那个类已经不存在了。 -->
  <div
    data-page="admin-login"
    class="dot-grid-bg flex min-h-screen min-h-dvh items-center justify-center p-4"
  >
    <Card class="w-full max-w-sm">
      <CardHeader class="space-y-2 pt-8 text-center">
        <div class="mx-auto flex justify-center">
          <BrandMark size="lg" />
        </div>
        <CardTitle class="text-xl">{{ siteName }}</CardTitle>
        <CardDescription>请输入管理员账号登录后台</CardDescription>
      </CardHeader>

      <CardContent>
        <form @submit.prevent="submit">
          <FieldGroup class="gap-5">
            <Field>
              <FieldLabel for="username">用户名</FieldLabel>
              <div class="relative">
                <User class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  v-model="username"
                  type="text"
                  autocomplete="username"
                  placeholder="请输入您的用户名"
                  class="pl-10"
                  @input="error = ''"
                />
              </div>
            </Field>

            <Field>
              <FieldLabel for="password">密码</FieldLabel>
              <div class="relative">
                <Lock class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                  class="pr-10 pl-10"
                  @input="error = ''"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="size-4" />
                  <Eye v-else class="size-4" />
                </Button>
              </div>
            </Field>

            <label for="remember" class="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
              <input
                id="remember"
                v-model="remember"
                type="checkbox"
                class="size-4 accent-primary"
              />
              记住7天
            </label>

            <Alert v-if="error" variant="destructive">
              <AlertCircle />
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>

            <Button type="submit" class="w-full" :disabled="loading">
              {{ loading ? '登录中…' : '进入后台' }}
            </Button>
          </FieldGroup>
        </form>

        <p class="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          <span>&copy; {{ year }} {{ siteName }}</span>
          <span class="mx-2 text-border">·</span>
          <a class="hover:text-foreground" href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
          <span class="mx-2 text-border">·</span>
          <a class="hover:text-foreground" href="/">下载APK</a>
        </p>
      </CardContent>
    </Card>
  </div>
</template>
