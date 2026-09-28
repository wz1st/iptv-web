import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/* 前端版本号注入。 */
function injectAppVersion() {
  const version = (process.env.APP_VERSION || '').trim()
  return {
    name: 'inject-app-version',
    transformIndexHtml(html) {
      return html.replaceAll('%APP_VERSION%', version)
    },
  }
}

/* iptv-web 前端构建配置。 */
export default defineConfig({
  plugins: [vue(), tailwindcss(), injectAppVersion()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 带 hash 的稳定命名，配合 nginx 的 /assets/ 长缓存
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    port: 5273,
    proxy: {
      /* 开发态只代理后端接口。 */
      '^/api/': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
      },
      // 客户端 / 播放器接口：本地联调 APK、订阅地址时用
      '^/(apk|mytv|getRss|ku9|epg|r|k)/': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
      },
      // 静态资源目录由后端提供（本地没有 nginx 的 alias）。
      '^/(app|images|icon|logo)/': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
      },
      // 升级探测 / 文档原文（仓库外的固定配置指向它们，见 apiRouter.go）
      '^/(version|ChangeLog\\.md)$': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
      },
    },
  },
})
