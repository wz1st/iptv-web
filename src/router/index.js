import { createRouter, createWebHistory } from 'vue-router'
import { installed, guideAck } from '@/utils/site'

// 前端路由表 —— 与后端 router/apiRouter.go 的接口表互不重叠：

const AdminLayout = () => import('@/views/admin/AdminLayout.vue')

// 合并页：一个组件承载多个路径（每个路径对应页内的一个标签）。
const EpgManage = () => import('@/views/admin/EpgManageView.vue')
const DeviceManage = () => import('@/views/admin/DeviceManageView.vue')
const ChannelManage = () => import('@/views/admin/ChannelManageView.vue')
const ClientSettings = () => import('@/views/admin/ClientSettingsView.vue')
const AdminsPanel = () => import('@/views/admin/system/AdminsPanel.vue')
const SslPanel = () => import('@/views/admin/system/SslPanel.vue')
const ProxyPanel = () => import('@/views/admin/system/ProxyPanel.vue')

const routes = [
  // ---- 前台（未安装时由守卫改道到 /install）----
  {
    path: '/',
    name: 'site-index',
    component: () => import('@/views/site/SiteIndex.vue'),
    meta: { public: true },
  },
  {
    path: '/mobile',
    name: 'site-mobile',
    component: () => import('@/views/site/SiteMobile.vue'),
    meta: { public: true },
  },

  // ---- 安装向导 ----
  {
    path: '/install',
    name: 'install',
    component: () => import('@/views/install/InstallWizard.vue'),
    meta: { public: true },
  },
  {
    path: '/install-log',
    name: 'install-log',
    component: () => import('@/views/install/InstallLog.vue'),
    meta: { public: true },
  },

  // ---- 登录（独立布局）----
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/AdminLogin.vue'),
    meta: { public: true },
  },

  // ---- 后台 ----
  {
    path: '/admin',
    component: AdminLayout,
    children: [
      { path: '', redirect: '/admin/index' },
      { path: 'index', name: 'admin-index', component: () => import('@/views/admin/DashboardView.vue'), meta: { title: '首页' } },
      { path: 'meals', name: 'admin-meals', component: () => import('@/views/admin/MealsView.vue'), meta: { title: '套餐管理' } },
      // EPG管理：默认 EPG列表
      { path: 'epgsList', name: 'admin-epgs', component: EpgManage, meta: { title: 'EPG列表' } },
      { path: 'epgFrom', name: 'admin-epgfrom', component: EpgManage, meta: { title: 'EPG来源' } },
      // 设备管理：默认 设备列表（菜单入口指向它）
      { path: 'users', name: 'admin-users', component: DeviceManage, meta: { title: '设备列表' } },
      { path: 'authors', name: 'admin-authors', component: DeviceManage, meta: { title: '设备授权' } },
      // 下发设置：运行期下发的配置（解码/缓冲/授权、提示语、开机公告）。
      // 从客户端设置页搬来 —— 改这些不必重新编译 APK，放编译表单旁容易误以为要重编。
      { path: 'deliver', name: 'admin-deliver', component: DeviceManage, meta: { title: '下发设置' } },
      // 频道管理：默认 频道分组
      { path: 'channels', name: 'admin-channels', component: ChannelManage, meta: { title: '频道分组' } },
      { path: 'channelsSource', name: 'admin-channels-source', component: ChannelManage, meta: { title: '频道源设置' } },
      // 客户端设置：清和壳 / 骆驼壳 / MyTV 三个标签**同一行**
      // （2026-10-14：从两行并成一行）。
      // 两个壳各自一条路由而不是组件内 ref —— ref 不落路由，
      // 刷新页面会回到第一个标签（切到另一个壳后刷新就跳回第一个，很突兀），
      // 而且标签条要参与"当前页高亮"，没有 path 没法和侧边栏对齐。
      //
      // ★路径名一律**按壳的本名**（client=清和壳 / clientLt=骆驼壳），
      //   名字与行为必须一致 —— 否则后来者照名字去找逻辑会找错分支。
      // ★清和壳占 /admin/client（主槽位，安装完自动编的就是它），骆驼壳走 /admin/clientLt。
      { path: 'client', name: 'admin-client', component: ClientSettings, meta: { title: '清和壳设置' } },
      { path: 'clientLt', name: 'admin-client-lt', component: ClientSettings, meta: { title: '骆驼壳设置' } },
      { path: 'clientMyTV', name: 'admin-client-mytv', component: ClientSettings, meta: { title: 'MyTV客户端设置' } },
      // 管理员设置：公告搬去客户端设置后，这里只剩一个面板，不再需要标签页
      { path: 'admins', name: 'admin-admins', component: AdminsPanel, meta: { title: '管理员设置' } },
      // SSL 证书：证书/私钥落在 /config/cert，开关与端口落在 config.yml 的 ssl 段
      { path: 'ssl', name: 'admin-ssl', component: SslPanel, meta: { title: 'SSL 证书' } },
      // 出网代理：协议/地址/端口/账密 + 作用范围，落在 config.yml 的 out_proxy 段
      { path: 'proxy', name: 'admin-proxy', component: ProxyPanel, meta: { title: '代理设置' } },
      // 进阶功能：授权引擎。改造前路径是 /admin/license，接口与二进制已改名 engine
      { path: 'engine', name: 'admin-engine', component: () => import('@/views/admin/EngineView.vue'), meta: { title: '进阶功能' } },
      // 使用说明：首次进入的引导页。未确认时由路由守卫锁定在此页，禁止进入其它后台页。
      { path: 'guide', name: 'admin-guide', component: () => import('@/views/admin/GuideView.vue'), meta: { title: '使用说明' } },
      // 在线升级：管理系统 / 前端整包 / 引擎三条链路。
      { path: 'updata', name: 'admin-updata', component: () => import('@/views/admin/UpdataView.vue'), meta: { title: '在线升级' } },
    ],
  },

  // 未知路径兜底：回前台首页。
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// 路由守卫 —— 两道判断，各自独立：
router.beforeEach((to) => {
  const path = to.path
  // 安装期限定的客户端路径：只有向导本身。更新记录不在此列。
  const isWizard = path === '/install'

  if (!installed.value) {
    // 未安装：向导与更新记录放行，其余全部拉到向导
    return isWizard || path === '/install-log' ? true : '/install'
  }

  if (isWizard) return '/'

  // 使用说明未确认：锁定在引导页，禁止进入其它后台页（登录页与引导页本身除外）。
  if (path.startsWith('/admin') && path !== '/admin/login' && path !== '/admin/guide' && !guideAck.value) {
    return '/admin/guide'
  }

  return true
})

export default router
