<script setup>
// 后台侧栏菜单按钮 —— 把「点击跳转 + 移动端跳完立刻关 sheet」打包在子组件里。
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar'
import { useRouter } from 'vue-router'

const props = defineProps({
  to: { type: String, required: true },
})

const router = useRouter()
const sidebar = useSidebar()

// 跳转后收尾：移动端关 sheet、桌面端无操作。
// router.push 返回 Promise，等它 resolve 让路由真的切完再收。
async function go() {
  await router.push(props.to)
  if (sidebar.isMobile.value) sidebar.setOpenMobile(false)
}
</script>

<template>
  <SidebarMenuButton v-bind="$attrs" @click="go">
    <slot />
  </SidebarMenuButton>
</template>