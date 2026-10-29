<script setup>
// 后台布局 —— shadcn-vue 的侧栏壳（与 One-KVM 的设置页同一套结构）。
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ImageZoom from '@/components/ImageZoom.vue'
import LicenseNotice from '@/components/LicenseNotice.vue'
import SponsorDialog from '@/components/SponsorDialog.vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import NavMenuButton from '@/components/admin/NavMenuButton.vue'
import { Sun, Moon, LogOut, Download } from 'lucide-vue-next'
import { siteName, version, isCustom, guideAck } from '@/utils/site'
import { API } from '@/api/endpoints'
import { confirm } from '@/utils/confirm'
import { clearLicenseNoticeSeen } from '@/utils/licenseNotice'
import { useTheme } from '@/composables/useTheme'
import { useUpdateBadge } from '@/composables/useUpdateBadge'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { hasBadge, runSilentCheck } = useUpdateBadge()

// 进入后台（登录后）静默盘点各组件新版本，给菜单/标签挂红点。只跑一次，
// 失败静默（后端不写 Docker 日志）；红点/提醒的有效期 = 本次登录会话。
onMounted(runSilentCheck)

// 菜单项的红点：把"组件键"聚合成"菜单入口"。
//   在线升级 → 管理系统(web) 或 引擎(engine) 任一有新版本
//   客户端设置 → 清和(qh) / 骆驼(lt) / MyTV(mytv) 任一有新版本
//   进阶功能 → 引擎(engine) 有新版本
function menuBadge(key) {
  if (key === 'updata') return hasBadge('web') || hasBadge('engine')
  if (key === 'client') return hasBadge('qh') || hasBadge('lt') || hasBadge('mytv')
  if (key === 'engine') return hasBadge('engine')
  return false
}

// 赞助作者弹窗（升级日志页已取消，赞助入口改为弹窗）。
const sponsorOpen = ref(false)

// 「点击跳转 + 移动端跳完立刻关 sheet」不能在 AdminLayout 的 setup 里做：

// 菜单分组。title 为空表示这一组不画组标题 —— 顶部的四个单页和
// 底部的两个入口都是"自成一组"的，硬起个名字反而多余。
//
// 写成 computed 是因为「系统」组里有两项要看授权等级：
//   定制分支（isCustom）隐藏「在线升级」，另加一项「下载页编辑」。
// 其余分组与授权无关，但同一个数组里放，就一起跟着算。
const MENU_GROUPS = computed(() => [
  {
    key: 'main',
    title: '',
    items: [
      { key: 'index', label: '首页', icon: 'home', paths: ['/admin/index'] },
      { key: 'meals', label: '套餐管理', icon: 'meal', paths: ['/admin/meals'] },
      { key: 'epgs', label: 'EPG管理', icon: 'epg', paths: ['/admin/epgsList', '/admin/epgFrom'] },
      { key: 'channels', label: '频道管理', icon: 'tv', paths: ['/admin/channels', '/admin/channelsSource'] },
    ],
  },
  {
    key: 'client',
    title: '客户端',
    items: [
      { key: 'users', label: '设备管理', icon: 'device', paths: ['/admin/users', '/admin/authors', '/admin/deliver'] },
      // 客户端设置：**四个标签同一行**（骆驼壳 /admin/client、清和壳 /admin/clientQh、
      // MyTV /admin/clientMyTV、定制APK /admin/clientCustom）。侧边栏用 paths 匹配高亮，
      // ★漏掉任何一条 ⇒ 停在该页时菜单不亮（记忆红线：改标签条必同步这里）。
      // MyTV 与定制APK 各自按授权显示（判据在 ClientSettingsView 的 isLic / isCustom）。
      { key: 'client', label: '客户端设置', icon: 'palette',
        paths: ['/admin/client', '/admin/clientQh', '/admin/clientMyTV', '/admin/clientCustom'] },
    ],
  },
  {
    key: 'sys',
    title: '系统',
    items: sysItems(),
  },
  {
    key: 'ext',
    title: '',
    items: [
      // 进阶功能：授权引擎。路径与接口已随引擎改名 license → engine
      { key: 'engine', label: '进阶功能', icon: 'key', paths: ['/admin/engine'] },
      // 使用说明置于整个菜单卡片最末
      { key: 'guide', label: '使用说明', icon: 'clipboard', paths: ['/admin/guide'] },
    ],
  },
])

// 「系统」组的条目。定制分支已把后台自己的「在线升级」入口整条删除 ——
// 定制包不走主线的发布位，唯一的在线链路是客户端设置里的 mytv 编译基底。
//
// 「SSL 证书」两项授权都显示（主线/定制都要配 HTTPS），所以放在无条件段，
// 只有「下载页编辑」按 isCustom 追加。
function sysItems() {
  const list = [
    // 系统公告已并入「客户端设置」，这里只剩管理员设置
    { key: 'admins', label: '管理员设置', icon: 'user', paths: ['/admin/admins'] },
    // HTTPS：上传/粘贴证书、开关 443 与 80 强制跳转、查看证书信息
    { key: 'ssl', label: 'SSL 证书', icon: 'shield', paths: ['/admin/ssl'] },
    // 出网代理：可分别作用于 EPG 更新 / 频道源更新 / 在线升级 / 中转取流
    { key: 'proxy', label: '代理设置', icon: 'globe', paths: ['/admin/proxy'] },
  ]
  if (isCustom.value) {
    list.push({ key: 'dlEdit', label: '下载页编辑', icon: 'palette', paths: ['/admin/dlEdit'] })
  }
  return list
}

const ALL_ITEMS = computed(() => MENU_GROUPS.value.flatMap((g) => g.items))

const isActive = (item) => item.paths.includes(route.path)

// 当前页标题 + 所属分组 —— 面包屑用。
const currentPage = computed(() => {
  const hit = ALL_ITEMS.value.find(isActive)
  if (!hit) return { group: '', label: route.meta?.title || '' }
  const group = MENU_GROUPS.value.find((g) => g.items.includes(hit))?.title || ''
  const label = route.path === hit.paths[0] ? hit.label : (route.meta?.title || hit.label)
  return { group, label }
})

async function logout() {
  if (!(await confirm('确定要退出登录吗？', { okText: '退出' }))) return
  try {
    await fetch(API.adminLogout, { credentials: 'same-origin' })
  } catch { /* 忽略网络错误，仍然回登录页 */ }
  // 退出时清掉"授权提示已弹过"的标记：换个账号登进来要重新看到一次提示。
  // 放在跳转之前 —— 跳转是整页导航，这行之后没有机会再执行。
  clearLicenseNoticeSeen()
  window.location.href = '/admin/login'
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-background">
    <!-- 顶栏：整宽铺在侧栏之上，侧栏从它下面开始（与 One-KVM 设置页一致） -->
    <header class="z-50 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="flex h-14 items-center gap-2 px-3 sm:px-4">
        <a
          class="flex min-w-0 items-center gap-2 text-foreground hover:opacity-80"
          href="/admin/index"
          @click.prevent="router.push('/admin/index')"
        >
          <span class="truncate text-base font-semibold tracking-tight">{{ siteName }}</span>
        </a>

        <span v-if="version" class="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {{ version }}
        </span>

        <div class="ml-auto flex items-center gap-1">
          <Button as-child variant="ghost" size="sm">
            <a href="/" target="_blank" rel="noopener">
              <Download />
              <span class="hidden sm:inline">下载客户端</span>
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
            @click="toggleTheme"
          >
            <Sun class="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon class="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <Button variant="ghost" size="icon-sm" aria-label="退出登录" @click="logout">
            <LogOut class="size-4" />
          </Button>
        </div>
      </div>
    </header>

    <SidebarProvider class="min-h-0 flex-1">
      <!-- top-14 = 顶栏高度：侧栏从顶栏下面开始，不从视口顶端开始 -->
      <Sidebar v-show="guideAck" collapsible="offcanvas" class="top-14 h-[calc(100dvh-3.5rem)]">
        <SidebarContent class="gap-0 px-2 py-3">
          <SidebarGroup v-for="group in MENU_GROUPS" :key="group.key" class="px-0 py-1">
            <SidebarGroupLabel v-if="group.title">{{ group.title }}</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in group.items" :key="item.key">
                <NavMenuButton
                  :to="item.paths[0]"
                  :is-active="isActive(item)"
                  :badge="menuBadge(item.key)"
                  :tooltip="item.label"
                  class="h-9 text-foreground data-[active=true]:bg-primary data-[active=true]:font-medium data-[active=true]:text-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
                >
                  <AppIcon :name="item.icon" :size="16" />
                  <span>{{ item.label }}</span>
                </NavMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <!-- 侧栏底部：版本号 + 两个外链。行距与内边距都压到最小 ——
             这一块常驻可见，占太高会把上面的菜单挤到需要滚动。 -->
        <div class="mt-auto shrink-0 border-t px-4 py-1.5 text-center text-[11.5px] leading-tight text-muted-foreground">
          <p class="m-0">{{ version }}</p>
          <p class="m-0 mt-0.5 flex justify-center gap-3">
            <a href="https://www.qingh.xyz" target="_blank" rel="noopener">清和博客</a>
            <!-- 赞助作者：弹窗展示两个收款码（升级日志页已取消，这里不再跳页） -->
            <button
              type="button"
              class="border-0 bg-transparent p-0 font-inherit text-inherit cursor-pointer hover:underline"
              @click="sponsorOpen = true"
            >赞助作者</button>
          </p>
        </div>
      </Sidebar>

      <SidebarInset class="min-w-0">
        <!-- 第二行：侧栏折叠按钮 + 面包屑。粘在内容区顶部，滚动时不跟着走 -->
        <div class="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" class="!h-5" />
          <nav class="flex min-w-0 items-center gap-2" aria-label="当前位置">
            <template v-if="currentPage.group">
              <span class="shrink-0 text-[13px] text-muted-foreground">{{ currentPage.group }}</span>
              <span class="shrink-0 text-xs text-border">/</span>
            </template>
            <span class="truncate text-sm font-semibold">{{ currentPage.label }}</span>
          </nav>
        </div>

        <div class="mx-auto w-full px-3 py-5 pb-10 sm:px-5 lg:px-6" style="max-width: var(--content-max)">
          <router-view v-slot="{ Component }">
            <component :is="Component" :key="route.path + JSON.stringify(route.query)" />
          </router-view>
        </div>
      </SidebarInset>
    </SidebarProvider>

    <!-- 台标放大预览：全局挂一份，任何页面/弹窗调 openImageZoom(url) 即可
         （状态在 utils/imageZoom.js，见那里的说明） -->
    <ImageZoom />

    <!-- 未授权提示：挂一份在布局上 = 进后台时判一次（组件内部用 onMounted， -->
    <LicenseNotice />

    <!-- 赞助作者：两个收款二维码（升级日志页已取消） -->
    <SponsorDialog v-model="sponsorOpen" />
  </div>
</template>
