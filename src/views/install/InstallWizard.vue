<script setup>
// 安装向导 —— 版式对齐 One-KVM（点阵底 + 居中卡片），**流程与接口一字未改**。
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { CircleAlert, CircleCheck, Download, FileText, LogIn } from 'lucide-vue-next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import BrandMark from '@/components/BrandMark.vue'
import { jsonPost } from '@/utils/request'
import { notify, loadingShow, loadingHide } from '@/utils/feedback'
import { siteName } from '@/utils/site'
import { renderMarkdown } from '@/utils/markdown'
import { API } from '@/api/endpoints'

const step = ref(1)          // 1=说明 2=表单 3=完成
const readme = ref('')
const loaded = ref(false)    // 说明文档是否已取回（用于区分「加载中」与「确实没有」）
const loading = ref(false)
/** 就地展示的校验/安装失败原因（改造前一律弹 toast，长表单里容易被忽略） */
const error = ref('')
const year = new Date().getFullYear()
const router = useRouter()

/** 初始化安装的默认账号 —— 用户名与密码都是 test */
const DEFAULT_ACCOUNT = 'test'

const form = ref({
  apkapi: '',
  username: DEFAULT_ACCOUNT,
  password: DEFAULT_ACCOUNT,
  password2: DEFAULT_ACCOUNT,
})

const readmeHtml = computed(() => renderMarkdown(readme.value))

onMounted(async () => {
  // 自动填充当前访问地址作为 APK 接口（与原 install_2 的 DOMContentLoaded 行为一致）
  form.value.apkapi = window.location.origin

  try {
    // 状态接口同时下发安装状态与 README/ChangeLog 正文：
    const res = await fetch(API.installState, { credentials: 'same-origin' })
    if (res.ok) {
      const st = await res.json()
      readme.value = st.readme || ''
      if (st.installed) step.value = 3
    }
  } catch {
    // 端点不可用时降级：仍展示说明，允许继续安装
  } finally {
    loaded.value = true
  }
})

function validate() {
  if (!form.value.apkapi) { error.value = 'APK接口错误'; return false }
  if (!form.value.username || !form.value.password || !form.value.password2) {
    error.value = '用户名或密码不能为空'; return false
  }
  if (form.value.password !== form.value.password2) {
    error.value = '两次密码不一致'; return false
  }
  return true
}

async function doInstall() {
  if (loading.value) return
  error.value = ''
  if (!validate()) return

  // 这个遮罩不能省：安装要现场编 APK，耗时以分钟计
  loadingShow()
  loading.value = true
  try {
    const res = await jsonPost(API.installSubmit, {
      username: form.value.username,
      password: form.value.password,
      password2: form.value.password2,
      apkapi: form.value.apkapi,
    })
    if (res.code === 1) {
      step.value = 3
      // 成功仍然留一条 toast：后端在这句话里带了「正在编译APK」的进度提示，
      // 完成页的静态文案承载不了这个信息。
      notify(res.msg || '安装成功', 'success', 6000)
    } else {
      error.value = res.msg || '安装失败'
    }
  } catch (e) {
    error.value = e?.message || '安装请求失败'
  } finally {
    loadingHide()
    loading.value = false
  }
}
</script>

<template>
  <div class="dot-grid-bg flex min-h-screen min-h-dvh justify-center p-4 sm:p-6">
    <!-- 步骤 3：完成 -->
    <Card v-if="step === 3" class="h-fit w-full max-w-md self-center">
      <CardHeader class="space-y-3 pt-8 text-center">
        <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CircleCheck class="size-8" />
        </div>
        <CardTitle class="text-xl">安装成功！</CardTitle>
        <CardDescription>恭喜，网站已经成功完成安装。配置源和套餐后即可享用~~</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button as-child size="lg">
          <a href="/admin/login">
            <LogIn />
            前往登录
          </a>
        </Button>
        <Button as-child variant="outline" size="lg">
          <a href="/">
            <Download />
            下载APK
          </a>
        </Button>
      </CardContent>
      <CardFooter class="justify-center border-t pt-6 text-xs text-muted-foreground">
        <span>&copy; {{ year }} {{ siteName }}</span>
        <span class="mx-2 text-border">·</span>
        <a class="hover:text-foreground" href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
      </CardFooter>
    </Card>

    <!-- 步骤 1：系统说明 -->
    <Card v-else-if="step === 1" class="h-fit w-full max-w-3xl">
      <CardHeader>
        <div class="flex items-center gap-3">
          <BrandMark size="lg" />
          <div class="space-y-1">
            <CardTitle class="text-lg">系统说明</CardTitle>
            <CardDescription>{{ siteName }} 尚未安装，请先阅读说明再开始安装。</CardDescription>
          </div>
        </div>
        <CardAction>
          <Button type="button" variant="outline" @click="router.push('/install-log')">
            <FileText />
            更新记录
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <!-- README.md 里的 [更新记录](./ChangeLog.md) 链接会被服务端 302 到 -->
        <!-- /install-log（由 InstallLog.vue 渲染排版），所以这里不需要改写链接。 -->
        <article v-if="readme" class="md-body" v-html="readmeHtml" />
        <p v-else-if="loaded" class="py-8 text-center text-sm text-muted-foreground">
          系统说明（README.md）未随镜像提供，可直接继续安装。
        </p>
        <p v-else class="py-8 text-center text-sm text-muted-foreground">正在加载系统说明…</p>
      </CardContent>

      <CardFooter class="flex-col gap-4 border-t pt-6">
        <Button type="button" size="lg" class="w-full sm:w-auto" @click="step = 2">前往安装</Button>
        <p class="text-xs text-muted-foreground">
          <span>&copy; {{ year }} {{ siteName }}</span>
          <span class="mx-2 text-border">·</span>
          <a class="hover:text-foreground" href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
        </p>
      </CardFooter>
    </Card>

    <!-- 步骤 2：安装表单 -->
    <Card v-else class="h-fit w-full max-w-lg self-center">
      <CardHeader class="space-y-2 pt-8 text-center">
        <div class="mx-auto flex justify-center">
          <BrandMark size="lg" />
        </div>
        <CardTitle class="text-xl">系统安装</CardTitle>
        <CardDescription>填写 APK 接口地址与管理员账号，提交后开始安装</CardDescription>
      </CardHeader>

      <CardContent>
        <form @submit.prevent="doInstall">
          <FieldGroup class="gap-5">
            <Field>
              <FieldLabel for="apkapi">APK接口地址</FieldLabel>
              <Input
                id="apkapi"
                v-model="form.apkapi"
                type="text"
                placeholder="请输入APK接口地址"
                @input="error = ''"
              />
              <p class="text-xs leading-relaxed text-muted-foreground">
                提示：若外网使用请填外网域名或外网ip，填写错误APK将无法连接。
                若安装完成后需要修改接口，可通过 /config/config.yml 修改 server_url 并重启容器。
              </p>
            </Field>

            <Field>
              <FieldLabel for="install-username">管理员用户名</FieldLabel>
              <Input
                id="install-username"
                v-model="form.username"
                type="text"
                autocomplete="username"
                placeholder="请输入您的用户名"
                @input="error = ''"
              />
            </Field>

            <Field>
              <FieldLabel for="install-password">密码</FieldLabel>
              <Input
                id="install-password"
                v-model="form.password"
                type="password"
                autocomplete="new-password"
                placeholder="请输入密码"
                @input="error = ''"
              />
            </Field>

            <Field>
              <FieldLabel for="install-password2">确认密码</FieldLabel>
              <!-- 刻意**不**在这里挂 @keyup.enter：表单本来就会因为 Enter 触发 -->
              <!-- 隐式提交，再加一个 keyup.enter 会让这个字段按下回车时 -->
              <!-- doInstall 跑两遍（装两次），是个老 bug。 -->
              <Input
                id="install-password2"
                v-model="form.password2"
                type="password"
                autocomplete="new-password"
                placeholder="确认密码"
                @input="error = ''"
              />
            </Field>

            <Alert v-if="error" variant="destructive">
              <CircleAlert />
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>

            <div class="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" size="lg" class="flex-1" :disabled="loading">
                {{ loading ? '安装中…' : '安装' }}
              </Button>
              <Button type="button" variant="outline" size="lg" :disabled="loading" @click="step = 1">
                返回说明
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter class="justify-center border-t pt-6 text-xs text-muted-foreground">
        <span>&copy; {{ year }} {{ siteName }}</span>
        <span class="mx-2 text-border">·</span>
        <a class="hover:text-foreground" href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
      </CardFooter>
    </Card>
  </div>
</template>
