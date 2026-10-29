<script setup>
// 下发设置 —— 从「客户端设置」搬过来的三块：应用默认设置 / 应用提示 / 系统公告。
//
// 为什么要搬：这三块都是**运行期下发给客户端**的配置（解码模式、缓冲时长、
// 提示语、开机公告），跟"编译一个 APK"是两件事 —— 改解码模式不需要重编包，
// 但过去它跟编译表单挤在同一页，导致用户为了改一句提示语要点一次"编译"。
// 编译是分钟级重活，把高频小改动和它分开才合理。
//
// ★ 接口**共用**，不按壳分：这三个字段存在同一份 config.yml 里
// （cfg.App.Decoder / BuffTimeout / NeedAuthor、cfg.Tips.*、公告），
// 两个壳读的是同一份。所以页内给"清和壳 / 骆驼壳"两个子 tab 只是为了
// 对照方便 —— 改哪个子 tab，存的都是同一份配置。
// （路径分壳的是**编译**：图标背景、基底、版本文件那些，见 ClientShellPanel。）
//
// 公告**不重写**：直接挂载现成的 NoticePanel（它有 adText/showTime/showInterval
// 三个字段与独立的取数端点，重写一遍必然漏字段）。
import { ref, onMounted } from 'vue'
import { post } from '@/api/http'
import { notify } from '@/utils/feedback'
import AdminTabs from '@/components/AdminTabs.vue'
import AppSwitch from '@/components/AppSwitch.vue'
import NoticePanel from '@/views/admin/client/NoticePanel.vue'
import { CLIENT_ROUTES, CLIENT_ROUTES_LT } from '@/api/endpoints'

// 与客户端设置页同一套路由表：提示语与公告是全局配置，两表指向同一个端点，
// 这里按 shell 取表只是为了将来万一要分壳时不用改调用处。
const props = defineProps({
  shell: { type: String, default: 'lt' },
})
const A = props.shell === 'lt' ? CLIENT_ROUTES_LT : CLIENT_ROUTES

const TABS = [
  { key: 'qinghe', label: '清和壳', hint: '解码、缓冲、授权、提示语与开机公告' },
  { key: 'lt', label: '骆驼壳', hint: '与清和壳共用同一份下发配置' },
]
const tab = ref(TABS[0].key)

/* 与客户端设置页一致的两档缓冲时长白名单：数值越大缓冲越久、起播越慢，
   不适合任意填。后端 DecoderSelect / SetBuffTimeOut 也各自校验一次。 */
const BUFF_OPTIONS = [5, 10, 15, 20, 25, 30]

const loading = ref(true)
const decoder = ref(0)
const buffTimeout = ref(10)
const needAuthor = ref(false)
const tips = ref({
  loading: '',
  userExpired: '',
  userForbidden: '',
  userNoReg: '',
})

/* POST /api/client/data 一次给全；tipSet / decoder / buffTimeout / needAuthor
   各自一条路由，与编译那边同构。 */
const dataUrl = props.shell === 'lt' ? '/api/client/lt/data' : '/api/client/data'

async function load() {
  loading.value = true
  try {
    const res = await post(dataUrl, {})
    // ★ /api/client/data 由 Go 侧 c.JSON(200, dto) 直接返回 DTO 本体
    // （loginUser/build/app/tips 都在顶层，没有 {code,msg,data} 外壳）。
    // 过去这里写 res?.data，恒为空对象 ⇒ 三项开关与四条提示语全部回落
    // 默认值，页面看着"有值"其实是初始值。动作端点是 reply() 包装的，
    // 那个才有 res.code / res.data，两者形状不同，别混。
    const g = res || {}
    const app = g.app || {}
    decoder.value = Number(app.decoder ?? 0)
    buffTimeout.value = Number(app.buffTimeout ?? 10)
    needAuthor.value = Number(app.needAuthor ?? 0) === 1
    const t = g.tips || {}
    tips.value = {
      loading: t.loading || '',
      userExpired: t.userExpired || '',
      userForbidden: t.userForbidden || '',
      userNoReg: t.userNoReg || '',
    }
  } catch (e) {
    notify('读取下发设置失败', 'danger')
  } finally {
    loading.value = false
  }
}

/* 三项都是"改完即存"，各自一条路由 —— 与改造前行为一致。
   逐项单独存而不是攒一个"保存"按钮：这三项的修改频率与风险都不同
   （提示语随时改，开机公告一改全网客户端都弹），攒一起反而容易漏改。 */
async function onDecoderChange() {
  const res = await post(A.decoder, { decoder: decoder.value })
  notify(res?.msg || (res?.code >= 1 ? '解码模式已保存' : '保存失败'), res?.code >= 1 ? 'success' : 'danger')
}

async function onBuffChange() {
  const res = await post(A.buffTimeout, { buffTimeout: buffTimeout.value })
  notify(res?.msg || (res?.code >= 1 ? '缓冲时长已保存' : '保存失败'), res?.code >= 1 ? 'success' : 'danger')
}

async function onNeedAuthorChange(v) {
  const res = await post(A.needAuthor, { needAuthor: v ? 1 : 0 })
  notify(res?.msg || (res?.code >= 1 ? '授权设置已保存' : '保存失败'), res?.code >= 1 ? 'success' : 'danger')
}

async function saveTips() {
  const res = await post(A.tipSet, {
    loading: tips.value.loading,
    userExpired: tips.value.userExpired,
    userForbidden: tips.value.userForbidden,
    userNoReg: tips.value.userNoReg,
  })
  notify(res?.msg || (res?.code >= 1 ? '提示语已保存' : '保存失败'), res?.code >= 1 ? 'success' : 'danger')
}

onMounted(load)
</script>

<template>
  <div>
    <!-- 页内子 tab：对照用。配置本身两壳共用（见文件头注释） -->
    <AdminTabs :tabs="TABS" :active="tab" @change="tab = $event" />

    <div class="ui-tabpanes">
      <!-- 数据只取一次：两壳共用同一份配置，切换子 tab 时不重新请求，
           免得切一下就闪一次 loading。 -->
      <div v-if="loading" class="ui-card"><div class="ui-card__body">读取中…</div></div>

      <template v-else>
        <!-- ============ 应用默认设置 ============ -->
        <div class="ui-card">
          <div class="ui-card__header"><h4>应用默认设置</h4></div>
          <div class="ui-card__body">
            <div class="ui-inline">
              <div class="ui-field" style="flex: none">
                <label class="ui-field__label">解码模式</label>
                <select v-model.number="decoder" class="ui-select" style="width: 150px" @change="onDecoderChange">
                  <option :value="0">自动选择</option>
                  <option :value="1">硬件解码</option>
                  <option :value="2">软件解码</option>
                </select>
              </div>

              <div class="ui-field" style="flex: none">
                <label class="ui-field__label">超时跳转时长</label>
                <select v-model.number="buffTimeout" class="ui-select" style="width: 130px" @change="onBuffChange">
                  <option v-for="s in BUFF_OPTIONS" :key="s" :value="s">{{ s }} 秒</option>
                </select>
              </div>

              <div class="ui-field" style="flex: none">
                <label class="ui-field__label">客户端强制授权</label>
                <AppSwitch v-model="needAuthor" @change="onNeedAuthorChange" />
                <small class="ui-help">
                  未授权客户端无法登录
                </small>
              </div>
            </div>
            <small class="ui-help">
              三项改完立即生效，<strong>不需要重新编译 APK</strong>；清和壳与骆驼壳共用同一份配置。
            </small>
          </div>
        </div>

        <!-- ============ 应用提示 ============ -->
        <div class="ui-card">
          <div class="ui-card__header"><h4>应用提示</h4></div>
          <div class="ui-card__body">
            <div class="ui-field">
              <label class="ui-field__label">节目加载提示</label>
              <input v-model="tips.loading" class="ui-input" type="text" />
            </div>
            <div class="ui-field">
              <label class="ui-field__label">授权到期提示</label>
              <input v-model="tips.userExpired" class="ui-input" type="text" />
            </div>
            <div class="ui-field">
              <label class="ui-field__label">账号停用提示</label>
              <input v-model="tips.userForbidden" class="ui-input" type="text" />
            </div>
            <div class="ui-field">
              <label class="ui-field__label">未予授权提示</label>
              <input v-model="tips.userNoReg" class="ui-input" type="text" />
            </div>
            <button class="ui-btn ui-btn--primary" type="button" @click="saveTips">保存</button>
          </div>
        </div>

        <!-- ============ 系统公告 ============
             复用现成的 NoticePanel（三个字段 + 独立取数端点都在那边），
             不在这里重写一份 —— 重写必然漏字段。 -->
        <NoticePanel />
      </template>
    </div>
  </div>
</template>
