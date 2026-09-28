<script setup>
// 「赞助作者」裸链 —— 同样要在 Provider 后代里才能调 setOpenMobile(false)。
// 用一个不挂 SidebarMenuButton 的链接组件，原生 <a> + @click.prevent 走 go()。
import { useSidebar } from '@/components/ui/sidebar'
import { useRouter } from 'vue-router'

const props = defineProps({
  to: { type: String, required: true },
})

const router = useRouter()
const sidebar = useSidebar()

async function go() {
  await router.push(props.to)
  if (sidebar.isMobile.value) sidebar.setOpenMobile(false)
}
</script>

<template>
  <a :href="to" v-bind="$attrs" @click.prevent="go">
    <slot />
  </a>
</template>