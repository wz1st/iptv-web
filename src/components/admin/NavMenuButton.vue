<script setup>
// 后台侧栏菜单按钮 —— 把「点击跳转 + 移动端跳完立刻关 sheet」打包在子组件里。
// badge=true 时右上角挂一个红色小圆点（有组件待更新时由父级传入）。
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar'
import { useRouter } from 'vue-router'

const props = defineProps({
  to: { type: String, required: true },
  badge: { type: Boolean, default: false },
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
  <span class="nav-menu-btn">
    <SidebarMenuButton v-bind="$attrs" @click="go">
      <slot />
    </SidebarMenuButton>
    <span v-if="badge" class="nav-menu-btn__dot" />
  </span>
</template>

<style scoped>
.nav-menu-btn {
  position: relative;
  display: block;
}
/* 红色小圆点：菜单项右上角，带背景色描边避免压在文字上。 */
.nav-menu-btn__dot {
  position: absolute;
  top: 5px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-danger);
  box-shadow: 0 0 0 2px var(--background);
  pointer-events: none;
}
</style>
