import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadBoot } from './utils/site'
import { rowTapDirective } from './utils/touchTap'

/* 唯一的全局样式入口。 */
import './style.css'

// 启动顺序：先取站点配置，再挂载应用。
;(function blockHistoryWhileHidden() {
  const h = window.history
  if (!h || typeof h.replaceState !== 'function') return
  for (const name of ['replaceState', 'pushState']) {
    const native = h[name].bind(h)
    h[name] = function patchedWhileHidden(...args) {
      if (document.visibilityState === 'hidden') return
      return native(...args)
    }
  }
})()

async function bootstrap() {
  await loadBoot()
  const app = createApp(App)
  // 触摸设备上"单击行"等价于"双击行"。
  app.directive('rowtap', rowTapDirective)
  app.use(router).mount('#app')
}

bootstrap()
