// 接口地址常量。

/** 取数端点 / 文件上传端点（全部由 http.js 的 post / upload 发出） */
export const API = {
  // ---- 前台 / 安装态（router/apiRouter.go 的 siteRoutes）----
  // 这几个是公开站点接口，仍是 GET（浏览器导航 / 容器健康检查探针）
  siteIndexData: '/api/site/index',
  installState: '/api/install/state',
  installSubmit: '/api/install/setup',
  version: '/api/site/version',
  changeLog: '/api/site/changelog',

  // ---- 登录 / 登出 ----
  adminLogin: '/api/login',
  adminLogout: '/api/logout',

  // ---- 取数：/api/<资源>/data（POST + JSON）----
  adminIndexData: '/api/index/data',
  adminUsersData: '/api/users/data',
  adminAuthorsData: '/api/authors/data',
  adminMealsData: '/api/meals/data',
  adminChannelsData: '/api/channels/data',
  adminEpgsData: '/api/epgs/data',
  adminEpgFromData: '/api/epgFrom/data',
  // 公告与客户端配置同页（客户端设置页的第一个标签），取数也挂在 client 下
  adminClientNoticeData: '/api/client/noticeData',
  adminClientData: '/api/client/data',
  adminClientMyTVData: '/api/clientMyTV/data',
  adminAdminsData: '/api/admins/data',
  adminUpdataData: '/api/updata/data',
  adminAboutData: '/api/about/data',
  adminGuideData: '/api/guide/data',
  adminGuideAck: '/api/guide/ack',
  adminEngineData: '/api/engine/data',
  // SSL 证书（系统菜单）：证书信息、开关、nginx 版本、文件路径
  adminSslData: '/api/ssl/data',
  // 出网代理（系统菜单）：协议/地址/端口/账密/作用范围
  adminProxyData: '/api/proxy/data',

  // ---- 只读探测 / 轮询（同样是 POST，只是没有参数）----
  adminEngineCheckProxy: '/api/engine/checkProxy',
  adminEngineLog: '/api/engine/log',
  adminClientBuildStatus: '/api/client/buildStatus',
  adminClientMyTVBuildStatus: '/api/clientMyTV/buildStatus',
  adminUpdataCheckWeb: '/api/updata/checkWeb',
  adminUpdataCheckEngine: '/api/updata/checkEngine',
  adminUpdataDownWeb: '/api/updata/downWeb',
  adminUpdataDownEngine: '/api/updata/downEngine',
  adminUpdata: '/api/updata/run',
  // 升级状态与进度：升级遮罩的唯一依据（刷新页面靠它恢复）
  adminUpdataStatus: '/api/updata/status',

  // ---- 文件上传（multipart/form-data，不参与 JSON 化）----
  // 客户端图标 / 背景的上传**不在这一组**：这两个是**按壳分**的端点（清和壳
  // /api/client/uploadIcon、骆驼壳 /api/client/lt/uploadIcon），见 CLIENT_ROUTES /
  // CLIENT_ROUTES_LT 里的 uploadIcon / uploadBj。
  // 在线检查/升级编译基底（远端 mytv-vX.Y.Z 序列，走 until/ghnet.go 的直连+国内加速）
  adminClientMyTVCheckBase: '/api/clientMyTV/checkBase',
  adminClientMyTVUpgradeBase: '/api/clientMyTV/upgradeBase',
  adminClientMyTVUploadBase: '/api/clientMyTV/uploadBaseApk',
  // 客户端基底的同构三件套，但序列是 client-vX.Y.Z，且编译全在 api 侧（不经引擎）
  adminClientCheckBase: '/api/client/checkBase',
  adminClientUpgradeBase: '/api/client/upgradeBase',
  adminClientUploadBase: '/api/client/uploadBaseApk',
  // 骆驼壳（独立客户端基底，主槽位）：与 清和壳 同构，路径带 /lt。
  // 图标 / 背景也是**分开的两套**（目录 /config/images/lt/*，URL 前缀 /lt/icon、
  // /lt/images），所以上传走 adminClientLtUploadIcon / adminClientLtUploadBj ——
  // 用清和壳那两个端点只会把图传到清和壳的目录里（后端不会报错，也不会生效）；
  // 解码 / 缓冲 / 授权 / 提示 / 公告仍是全局配置，走 /api/client/*。
  adminClientLtData: '/api/client/lt/data',
  adminClientLtBuildStatus: '/api/client/lt/buildStatus',
  adminClientLtUploadBase: '/api/client/lt/uploadBaseApk',
  adminClientLtCheckBase: '/api/client/lt/checkBase',
  adminClientLtUpgradeBase: '/api/client/lt/upgradeBase',
  adminChannelsUploadPayList: '/api/channels/uploadPayList',
  adminEpgsUploadLogo: '/api/epgs/uploadLogo',
}

// POST 动作端点

/** 设备列表（/api/users）—— 批量操作的 ids 是设备名 */
export const USER_ROUTES = {
  delete: '/api/users/delete',
  marks: '/api/users/marks',
  forbid: '/api/users/forbid',
  meals: '/api/users/meals',
}

/** 设备授权（/api/authors） */
export const AUTHOR_ROUTES = {
  authorize: '/api/authors/authorize',
  forbid: '/api/authors/forbid',
  deleteExpired: '/api/authors/deleteExpired',
  delete: '/api/authors/delete',
  deleteAll: '/api/authors/deleteAll',
}

/** 套餐（/api/meals） */
export const MEAL_ROUTES = {
  status: '/api/meals/status',
  edit: '/api/meals/edit',
  create: '/api/meals/create',
  delete: '/api/meals/delete',
  save: '/api/meals/save',
}

/** 频道（/api/channels）—— 三段式已收敛为两段（list/update → listUpdate） */
export const CHANNEL_ROUTES = {
  listUpdate: '/api/channels/listUpdate',
  listUpdateAll: '/api/channels/listUpdateAll',
  listSave: '/api/channels/listSave',
  listDelete: '/api/channels/listDelete',
  // 频道源列表上「更新间隔 / 自动更新」两列的开关。与 listSave 分开：
  listFlag: '/api/channels/listFlag',

  caChannels: '/api/channels/caChannels',
  caStatus: '/api/channels/caStatus',
  caSave: '/api/channels/caSave',
  caDelete: '/api/channels/caDelete',

  caListStatus: '/api/channels/caListStatus',
  channelStatus: '/api/channels/channelStatus',
  // 分类拖拽排序：整表顺序一次提交，取代原来的 moveUp/moveDown/moveTop
  // （那三个一次只挪一格，拖拽的落点可能跨任意多格，用它们要发十几个请求）
  caSort: '/api/channels/caSort',
  // 分组列表上「中转访问 / 频道重命名」两列的开关。与 caSave 分开：caSave 是
  caFlag: '/api/channels/caFlag',
  // 分组内频道的拖拽排序（「频道分组 → 管理」弹窗那张表）。
  chSort: '/api/channels/chSort',
  // 删除分组内的单个频道（同上那张表的操作列）。
  // 与 channelStatus 分开：删除不可逆，独立 url 便于在路由表上被看清。
  chDelete: '/api/channels/chDelete',
  // 整表保存「编辑频道」弹窗里的那份列表：顺序即提交顺序、内容即最终内容、
  // 行首 `0|` 前缀携带停用状态（文本即真值，与 txt 列表导入同一条链路）。
  chImport: '/api/channels/chImport',
  saveOne: '/api/channels/saveOne',
  testResolution: '/api/channels/testResolution',
}

/** EPG 列表（/api/epgs）—— 改造前叫 epgsList，接口名与页面路径解耦 */
export const EPG_ROUTES = {
  bindable: '/api/epgs/bindable',
  save: '/api/epgs/save',
  bind: '/api/epgs/bind',
  status: '/api/epgs/status',
  delete: '/api/epgs/delete',
  bindChannel: '/api/epgs/bindChannel',
  clearBind: '/api/epgs/clearBind',
  clearCache: '/api/epgs/clearCache',
  deleteLogo: '/api/epgs/deleteLogo',
  deleteUnbound: '/api/epgs/deleteUnbound',
}

/** EPG 来源（/api/epgFrom） */
export const EPG_FROM_ROUTES = {
  status: '/api/epgFrom/status',
  update: '/api/epgFrom/update',
  updateAll: '/api/epgFrom/updateAll',
  save: '/api/epgFrom/save',
  delete: '/api/epgFrom/delete',
}

/** 清和客户端（/api/client）—— 开关与文案各一条路由 */
export const CLIENT_ROUTES = {
  // 上传 / 删除图标与背景：只动**清和壳**的素材目录（/config/images/{icon,bj}，
  // URL 前缀 /icon、/images）。骆驼壳那一套在 CLIENT_ROUTES_LT 里，两边端点不同。
  uploadIcon: '/api/client/uploadIcon',
  uploadBj: '/api/client/uploadBj',
  deleteIcon: '/api/client/deleteIcon',
  deleteBj: '/api/client/deleteBj',
  decoder: '/api/client/decoder',
  buffTimeout: '/api/client/buffTimeout',
  needAuthor: '/api/client/needAuthor',
  forceUpdate: '/api/client/forceUpdate',
  appInfo: '/api/client/appInfo',
  // 「保存并测试」拆两步：这条只探测可达性，不落盘也不触发编译
  // （编译是分钟级重活，每改一个字就编一次会把队列打满）。
  testUrl: '/api/client/testUrl',
  // 只把地址落盘（写 config.yml），不触发编译：测试通过或 IPv6 假阴性强制保存时调用。
  saveUrl: '/api/client/saveUrl',
  // 发布：把待发布 apk 提升为线上版本（详见 service.PublishAPK）
  publish: '/api/client/publish',
  tipSet: '/api/client/tipSet',
  // 编译基底（底包）：查远端 client-vX.Y.Z / 在线升级（上传走 multipart，在 API 里）
  checkBase: '/api/client/checkBase',
  upgradeBase: '/api/client/upgradeBase',
  // 公告：保存客户端启动时弹出的那条文案（原先在 /api/notice/save）
  noticeSave: '/api/client/noticeSave',
}

/** 骆驼壳（/api/client/lt）—— 与 清和壳 同构，只是路径带 /lt，且它是**主槽位**。
 *  图标/背景也是**各自一套**（/config/images/lt/*，URL 前缀 /lt/icon、/lt/images），
 *  所以上传/删除都走 /api/client/lt/*；解码/缓冲/授权/提示/公告仍是全局配置，
 *  走 /api/client/*。 */
export const CLIENT_ROUTES_LT = {
  uploadIcon: '/api/client/lt/uploadIcon',
  uploadBj: '/api/client/lt/uploadBj',
  deleteIcon: '/api/client/lt/deleteIcon',
  deleteBj: '/api/client/lt/deleteBj',
  decoder: '/api/client/decoder',
  buffTimeout: '/api/client/buffTimeout',
  needAuthor: '/api/client/needAuthor',
  tipSet: '/api/client/tipSet',
  noticeSave: '/api/client/noticeSave',
  // 骆驼壳专属：编译 / 发布 / 在线检查升级基底
  appInfo: '/api/client/lt/appInfo',
  testUrl: '/api/client/lt/testUrl',
  saveUrl: '/api/client/lt/saveUrl',
  publish: '/api/client/lt/publish',
  checkBase: '/api/client/lt/checkBase',
  upgradeBase: '/api/client/lt/upgradeBase',
}

/** 进阶功能（授权引擎，/api/engine）—— 改造前叫 license */
export const ENGINE_ROUTES = {
  proxy: '/api/engine/proxy',
  restartEngine: '/api/engine/restart',
  autoRes: '/api/engine/autoRes',
  disCh: '/api/engine/disCh',
  epgFuzz: '/api/engine/epgFuzz',
  register: '/api/engine/register',
  login: '/api/engine/login',
  changePwd: '/api/engine/changePwd',
  reset: '/api/engine/reset',
  logout: '/api/engine/logout',
  shortURL: '/api/engine/shortURL',
}

/** MyTV 客户端（/api/clientMyTV）—— 编译/发布与清和壳同一套三段语义 */
export const MYTV_ROUTES = {
  // 编译：只产待发布包（<MyTVName>-mytv-new.apk），线上包不动
  clientMyTV: '/api/clientMyTV/save',
  // 发布：待发布包 rename 上位并落版本号（详见 service.PublishMytvAPK）
  publish: '/api/clientMyTV/publish',
  // 上传编译基底 APK（multipart，字段名 apkfile）：包名须与镜像内底包一致，
  // 版本号从包里提取成基底版本（详见 service.UploadMytvBaseApk）
  uploadBaseApk: '/api/clientMyTV/uploadBaseApk',
}

/** SSL 证书（/api/ssl）—— 证书落在 /config/cert，开关落在 config.yml 的 ssl 段 */
export const SSL_ROUTES = {
  // 保存：证书/私钥（留空表示保持不变）+ 开关，然后渲染 nginx 片段并 reload
  save: '/api/ssl/save',
  // 清除：删掉证书与私钥，并把两个开关一起关掉
  clear: '/api/ssl/clear',
}

/** 出网代理（/api/proxy）—— 协议/地址/端口/账密/作用范围落在 config.yml 的 out_proxy 段 */
export const PROXY_ROUTES = {
  // 只测不存：连代理 + 访问 GitHub/Google，失败时 data.failType 区分
  // dial（代理连不通）与 overseas（能连但出不去）
  test: '/api/proxy/test',
  // 保存连接参数（协议/地址/端口/账密）：有代理时服务端内部会再测一次，
  // 不通过一律不落盘；选「无代理」时跳过测试直接存。**不带**作用范围开关。
  save: '/api/proxy/save',
  // 单独改一个作用范围开关（useEpg/useSrc/useUp/useRelay），拨一下即生效
  scope: '/api/proxy/scope',
}

/** 只有一个动作的资源：端点即动作（补上动作名后统一两段式） */
export const ROUTES = {
  // 公告已移入 CLIENT_ROUTES（规范路径 /api/client/noticeSave）
  admins: '/api/admins/save',
  rssUrl: '/api/rss/url',
}

// 这里原本还有一个 PROXY_SCHEMES（中转的 http/https 候选值，对齐旧模板的
