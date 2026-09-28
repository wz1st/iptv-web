<script setup>
// 官网下载页（PC）—— 重构自 index.html。
import { ref, onMounted } from 'vue'
import { siteName } from '@/utils/site'

const dto = ref({
  show_down: false,
  apk_url: '',
  apk_name: '',
  show_down_mytv: false,
  mytv_url: '',
  mytv_name: '',
})

onMounted(async () => {
  try {
    const res = await fetch('/api/site/index', { credentials: 'same-origin' })
    if (res.ok) Object.assign(dto.value, await res.json())
  } catch { /* 静默降级：不显示下载按钮 */ }
})

const features = [
  { img: '/static/images/subscribe.png', label: '订阅' },
  { img: '/static/images/lapse.png', label: '时移' },
  { img: '/static/images/pause.png', label: '暂停' },
  { img: '/static/images/catchup.png', label: '回看' },
  { img: '/static/images/collect.png', label: '收藏' },
  { img: '/static/images/carousel.png', label: '轮播' },
]

// 静态图路径走运行时绑定，不写成 <img src="/...">。
const img = {
  logo: '/static/images/logo.png',
  tv: '/static/images/tv.png',
  channel: '/static/images/channel.png',
  timeshifting: '/static/images/timeshifting.png',
}
</script>

<template>
  <div class="site">
    <!-- 第一屏 -->
    <section class="hero">
      <div class="wrap">
        <div class="hero__inner">
          <div class="hero__left">
            <div class="hero__brand">
              <img :src="img.logo" alt="logo" />
              <span>清和电视</span>
            </div>
            <p class="hero__slogan">最任性、最好用的直播软件</p>
            <p class="hero__desc">
              清和电视直播运行于智能电视机顶盒或者智能电视机，操作简单，集直播、回看、预约、
              一周节目表(EPG)于一身，继承传统的上下键换台，无需任何学习，下载即可上手。
              具有行业领先的频道收藏、隐藏、WIFI传源等功能。
            </p>

            <div class="hero__download">
              <a
                v-if="dto.show_down"
                class="dl dl--primary"
                :href="dto.apk_url"
                :download="dto.apk_name"
              >
                {{ dto.apk_name }}（骆驼）
              </a>
              <a
                v-if="dto.show_down_mytv"
                class="dl dl--secondary"
                :href="dto.mytv_url"
                :download="dto.mytv_name"
              >
                {{ dto.mytv_name }}（MyTV）
              </a>
              <a class="dl dl--ghost" href="/admin">{{ siteName }}</a>
            </div>

            <p v-if="!dto.show_down && !dto.show_down_mytv" class="hero__hint">
              客户端正在编译中，请稍后刷新本页…
            </p>
          </div>

          <div class="hero__right">
            <img :src="img.tv" alt="tv" />
          </div>
        </div>

        <ul class="featurebar">
          <li v-for="f in features" :key="f.label">
            <img :src="f.img" :alt="f.label" />
          </li>
        </ul>
      </div>
    </section>

    <!-- 第二屏 -->
    <section class="block">
      <div class="wrap">
        <div class="block__row">
          <div class="block__text">
            <h3>任性选频道</h3>
            <p class="hl">11个频道分类，1400+频道数量</p>
            <p class="hl">央视、卫视、体育、娱乐、少儿等</p>
            <p>想看什么就看什么</p>
          </div>
          <div class="block__pic"><img :src="img.channel" alt="channel" /></div>
        </div>

        <div class="block__row block__row--rev">
          <div class="block__pic"><img :src="img.timeshifting" alt="timeshift" /></div>
          <div class="block__text">
            <h3>任性直播时移</h3>
            <p class="hl">6小时时移，前进、倒退、暂停</p>
            <p class="hl">不会错过任何精彩瞬间</p>
            <p>轻松跳过广告时间</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <div class="wrap">
        <p class="foot__disclaimer">
          免责声明：所有内容均来源于公开的网络链接，清和电视不承担任何内容所引起的争议和法律责任
        </p>
        <p class="foot__copy">&copy; 2025 {{ siteName }}</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site { background: #fff; }

.wrap { max-width: 1180px; margin: 0 auto; padding: 0 22px; }

/* 第一屏 */
.hero {
  background: linear-gradient(160deg, #f0f6ff 0%, #e8f1ff 55%, #f7fbff 100%);
  padding: 46px 0 0;
}
.hero__inner {
  display: flex; align-items: center; gap: 40px; flex-wrap: wrap;
}
.hero__left { flex: 1 1 420px; }
.hero__right { flex: 1 1 320px; text-align: center; }
.hero__right img { max-width: 100%; height: auto; }

.hero__brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.hero__brand img { height: 42px; width: auto; }
.hero__brand span { font-size: 24px; font-weight: 700; color: #1e3a8a; }

.hero__slogan { font-size: 19px; font-weight: 600; color: #2563eb; margin: 0 0 14px; }
.hero__desc { font-size: 14px; line-height: 1.85; color: #4b5563; margin: 0 0 24px; }

.hero__download { display: flex; flex-direction: column; gap: 10px; max-width: 330px; }
.dl {
  display: block; padding: 12px 20px; border-radius: 26px;
  text-align: center; font-size: 15px; font-weight: 600;
  text-decoration: none; transition: transform .15s, box-shadow .15s;
}
.dl:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(37, 99, 235, .22); text-decoration: none; }
.dl--primary { background: #2563eb; color: #fff; }
.dl--secondary { background: #0891b2; color: #fff; }
.dl--ghost { background: #fff; color: #2563eb; border: 1px solid #bfdbfe; }

.hero__hint { font-size: 13px; color: #9ca3af; margin-top: 12px; }

.featurebar {
  display: flex; justify-content: space-around; align-items: center;
  flex-wrap: wrap; gap: 18px;
  list-style: none; margin: 40px 0 0; padding: 24px 0;
  border-top: 1px solid #e0ecff;
}
.featurebar img { height: 46px; width: auto; opacity: .9; }

/* 第二屏 */
.block { padding: 56px 0; background: #fff; }
.block__row {
  display: flex; align-items: center; gap: 44px;
  flex-wrap: wrap; margin-bottom: 54px;
}
.block__row:last-child { margin-bottom: 0; }
.block__row--rev { flex-direction: row-reverse; }
.block__text { flex: 1 1 340px; }
.block__pic { flex: 1 1 320px; text-align: center; }
.block__pic img { max-width: 100%; height: auto; }
.block__text h3 { font-size: 24px; color: #1e3a8a; margin: 0 0 16px; }
.block__text p { font-size: 15px; margin: 8px 0; color: #6b7280; }
.block__text p.hl { color: #2563eb; font-weight: 600; font-size: 16px; }

/* 尾 */
.foot { background: #1f2937; color: #9ca3af; padding: 30px 0; }
.foot__disclaimer { font-size: 13px; margin: 0 0 10px; }
.foot__copy { font-size: 13px; margin: 0; }

@media (max-width: 700px) {
  .block__row, .block__row--rev { flex-direction: column; gap: 26px; }
  .hero__brand span { font-size: 20px; }
}
</style>
