<script setup>
// 设备授权 —— 重构自 admin_authors.html。
// 在「设备管理」页里是第二个标签（/admin/authors），
// 默认标签是设备列表（/admin/users，UsersPanel）。……
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { post } from '@/api/http'
import { submitAction } from '@/utils/page'
import { confirm } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, AUTHOR_ROUTES } from '@/api/endpoints'
import AppPagination from '@/components/AppPagination.vue'
import AppModal from '@/components/AppModal.vue'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(false)

const keywords = ref('')
const order = ref('id')
const page = ref(1)
const recCounts = ref(20)

const showEdit = ref(false)
const editForm = ref({ name: '', deviceId: '', model: '', ip: '', region: '', lastTimeStr: '', expDays: '', expDesc: '', mealId: '1000' })

const users = computed(() => data.value?.users || [])
const meals = computed(() => data.value?.meals || [])

// key 是行对象字段名，sort 是后端 ORDER BY 的列名白名单
// （api/spaListApi.go 的 orderAllowedAuthors）—— 必须逐字一致，
// 写错只会静默回退成按 id 排序。
const COLUMNS = [
  { key: 'name', label: '账号', sort: 'name', w: '100px' },
  { key: 'deviceId', label: '设备ID', sort: 'device_id', w: '200px' },
  { key: 'model', label: '型号', sort: 'model', w: '130px' },
  { key: 'ip', label: 'IP', sort: 'ip', w: '130px' },
  { key: 'region', label: '地区', sort: 'region', w: '120px' },
  { key: 'expDesc', label: '状态', sort: 'expire_time', w: '100px' },
  { key: 'lastTimeStr', label: '最后登陆', sort: 'last_time', w: '160px' },
]

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminAuthorsData, {
      page: page.value,
      recCounts: recCounts.value,
      order: order.value,
      keywords: keywords.value,
    })
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}

// 地址栏是这几个参数的**外部输入**：直接打开带参数的链接（或刷新、前进后退）
// 必须还原成同一次查询，而不是每次都从第一页、默认排序开始。
onMounted(() => {
  keywords.value = route.query.keywords || ''
  order.value = route.query.order || 'id'
  page.value = Number(route.query.page || 1)
  recCounts.value = Number(route.query.recCounts || 20)
  load()
})

/** 把当前查询状态写回地址栏（replace：翻页/排序不该在历史里堆一堆记录） */
function syncUrl() {
  router.replace({
    query: {
      page: page.value,
      recCounts: recCounts.value,
      order: order.value,
      keywords: keywords.value || undefined,
    },
  })
}

function sortBy(k) { order.value = k; page.value = 1; syncUrl(); load() }
function search() { page.value = 1; syncUrl(); load() }
function changePage(p) { page.value = p; syncUrl(); load() }
watch(recCounts, () => { page.value = 1; syncUrl(); load() })

/* ---- 行内编辑（原底部批量操作栏；勾选这套中转已取消） ---- */

/** 双击行打开编辑：作用域只有这一行，所以 ids 里永远只有它自己 */
function openEdit(u) {
  editForm.value = {
    name: u.name == null ? '' : String(u.name),
    deviceId: u.deviceId,
    model: u.model,
    ip: u.ip,
    region: u.region,
    lastTimeStr: u.lastTimeStr,
    expDays: u.expDays,
    expDesc: u.expDesc,
    // 默认选中「默认/测试套餐」；批量栏取消后这里是唯一的套餐来源
    mealId: '1000',
  }
  showEdit.value = true
}

/** 单行提交：端点仍是批量接口，ids 只放这一行的设备名 */
async function submitRow(url, extra = {}, confirmMsg) {
  if (confirmMsg && !(await confirm(confirmMsg, { okVariant: 'danger', okText: '确定' }))) return
  await submitAction(url, { ids: [editForm.value.name], ...extra }, {
    reload: async () => { showEdit.value = false; await load() },
  })
}

const authorizeForever = () => submitRow(AUTHOR_ROUTES.authorize, { mealId: editForm.value.mealId })
const forbidTrial = () => submitRow(AUTHOR_ROUTES.forbid)

/** 删除该行（行操作） */
async function delOne(u) {
  const name = String(u.name)
  if (!(await confirm(`确定删除记录「${name}」吗？`, { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(AUTHOR_ROUTES.delete, { ids: [name] }, { reload: load })
}

/** 整表清理：不依赖任何一行，留在底部条 */
async function clearOneDayBefore() {
  if (!(await confirm('确认清空一天前待授权信息？', { okVariant: 'danger', okText: '确定' }))) return
  await submitAction(AUTHOR_ROUTES.deleteExpired, {}, { reload: load })
}

async function clearAll() {
  if (!(await confirm('确认删除所有待授权信息？', { okVariant: 'danger', okText: '确定' }))) return
  await submitAction(AUTHOR_ROUTES.deleteAll, {}, { reload: load })
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header">
        <div class="ui-inline u-gap-8">
          <h4>待授权列表</h4>
          <span class="ui-hint">双击任意一行可编辑</span>
        </div>
        <span class="u-text-sm u-text-2">
          待授权用户：{{ data?.unauthorizedUserTotal ?? 0 }} &nbsp;|&nbsp; 今日上线：{{ data?.newUserToday ?? 0 }}
        </span>
      </div>

      <div class="ui-card__toolbar">
        <div class="ui-inline">
          <span class="u-text-sm u-text-2">每页</span>
          <select v-model.number="recCounts" class="ui-select ui-input--sm" style="width: 80px">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <span class="u-text-sm u-text-2">条</span>
        </div>

        <div class="ui-inline">
          <input
            v-model="keywords"
            class="ui-input ui-input--sm"
            style="width: 220px"
            placeholder="请输入名称"
            @keyup.enter="search"
          />
          <button class="ui-btn ui-btn--sm" type="button" @click="search">搜索</button>
        </div>
      </div>

      <div class="ui-card__body ui-card__body--flush">
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th
                  v-for="c in COLUMNS"
                  :key="c.key"
                  :style="c.w ? `width:${c.w}` : ''"
                  class="ui-th-sort"
                  @click="sortBy(c.sort)"
                >
                  {{ c.label }}
                  <span v-if="order === c.sort" class="ui-th-sort__mark">▼</span>
                </th>
                <th class="u-center" style="width: 90px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="ui-table__status"><span class="ui-spinner" />正在加载待授权列表…</td>
              </tr>
              <tr v-else-if="!users.length">
                <td colspan="8" class="ui-table__empty">对不起，当前未有待授权的用户数据</td>
              </tr>
              <tr v-for="u in users" :key="u.id" class="is-editable" title="双击编辑该记录" v-rowtap="() => openEdit(u)">
                <td>{{ u.name }}</td>
                <td class="u-mono u-text-sm">{{ u.deviceId }}</td>
                <td>{{ u.model }}</td>
                <td>{{ u.ip }}</td>
                <td>{{ u.region }}</td>
                <td :title="u.expDesc">{{ u.expDays }}</td>
                <td class="u-text-sm">{{ u.lastTimeStr }}</td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <button class="ui-btn ui-btn--danger ui-btn--xs" type="button" @click="delOne(u)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 整表清理：与"某一行"无关的动作留在这里（行内动作已移入行编辑） -->
        <div class="ui-bulkbar">
          <span class="ui-hint">整表清理：</span>
          <button class="ui-btn ui-btn--sm" type="button" @click="clearOneDayBefore">清空一天前记录</button>
          <button class="ui-btn ui-btn--danger ui-btn--sm" type="button" @click="clearAll">清空所有记录</button>
        </div>
      </div>

      <AppPagination
        :page="data?.page ?? page"
        :page-count="data?.pageCount ?? 1"
        @page-change="changePage"
      />
    </div>

    <!-- ============ 弹窗：编辑待授权设备（原底部批量操作改到这里） ============ -->
    <AppModal v-model="showEdit" title="编辑待授权设备">
      <div class="ui-kv">账号：<span class="ui-kv__v">{{ editForm.name || '-' }}</span></div>
      <div class="ui-kv">设备ID：<span class="ui-kv__v ui-kv__v--mono">{{ editForm.deviceId || '-' }}</span></div>
      <div class="ui-kv">型号：<span class="ui-kv__v">{{ editForm.model || '-' }}</span></div>
      <div class="ui-kv">IP：<span class="ui-kv__v ui-kv__v--mono">{{ editForm.ip || '-' }}</span></div>
      <div class="ui-kv">地区：<span class="ui-kv__v">{{ editForm.region || '-' }}</span></div>
      <div class="ui-kv" :title="editForm.expDesc">状态：<span class="ui-kv__v">{{ editForm.expDays || '-' }}</span></div>
      <div class="ui-kv">最后登陆：<span class="ui-kv__v">{{ editForm.lastTimeStr || '-' }}</span></div>

      <div class="ui-field u-mb-0">
        <label class="ui-field__label">授权套餐</label>
        <select v-model="editForm.mealId" class="ui-select">
          <template v-if="meals.length">
            <option v-for="m in meals" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
          </template>
          <option v-else value="1000">默认/测试套餐</option>
        </select>
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="forbidTrial">禁止试用</button>
        <button class="ui-btn" type="button" @click="showEdit = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="authorizeForever">永久授权</button>
      </template>
    </AppModal>
  </div>
</template>
