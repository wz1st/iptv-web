<script setup>
// 设备列表 —— 重构自 admin_user.html。
// 在「设备管理」页里是**默认标签**（菜单入口 /admin/users 指向它），
// 另一半是设备授权（/admin/authors，AuthorsPanel）。……
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { post } from '@/api/http'
import { submitAction } from '@/utils/page'
import { confirm } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, USER_ROUTES } from '@/api/endpoints'
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
const editForm = ref({ name: '', deviceId: '', model: '', ip: '', region: '', lastTimeStr: '', expDays: '', expDesc: '', mealId: '', marks: '' })

const users = computed(() => data.value?.users || [])
const meals = computed(() => data.value?.meals || [])

// key 是行对象字段名（models.IptvUserShow 的 json tag）；
// sort 是**后端 ORDER BY 的列名白名单**（api/spaListApi.go 的
// orderAllowedUsers）—— 两者不是一回事。sort 走的是 SQL 列名，……
const COLUMNS = [
  { key: 'name', label: '账号', sort: 'name', w: '90px' },
  { key: 'mealName', label: '套餐', sort: 'meal_id', w: '110px' },
  { key: 'deviceId', label: '设备ID', sort: 'device_id', w: '170px' },
  { key: 'model', label: '型号', sort: 'model', w: '120px' },
  { key: 'ip', label: 'IP', sort: 'ip', w: '120px' },
  { key: 'region', label: '地区', sort: 'region', w: '110px' },
  { key: 'lastTimeStr', label: '最后登陆', sort: 'last_time', w: '150px' },
  { key: 'expDesc', label: '状态', sort: 'expire_time', w: '90px' },
  { key: 'author', label: '授权人', sort: 'author', w: '100px' },
  { key: 'marks', label: '备注', sort: 'marks' },
]

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminUsersData, {
      page: page.value,
      recCounts: recCounts.value,
      order: order.value,
      keywords: keywords.value,
    })
  } catch { /* http.js 已处理鉴权失效 */ } finally {
    loading.value = false
  }
}

onMounted(() => {
  keywords.value = route.query.keywords || ''
  order.value = route.query.order || 'id'
  page.value = Number(route.query.page || 1)
  recCounts.value = Number(route.query.recCounts || 20)
  load()
})

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

function sortBy(key) {
  order.value = key
  page.value = 1
  syncUrl()
  load()
}

function search() {
  page.value = 1
  syncUrl()
  load()
}

function changePage(p) {
  page.value = p
  syncUrl()
  load()
}

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
    mealId: u.mealId != null ? String(u.mealId) : '',
    marks: u.marks ?? '',
  }
  showEdit.value = true
}

// 套餐与备注在后端是两条动作路由（users/marks、users/meals），
// 所以「保存」要各提交一次；两次都成功才关弹窗并刷新。
async function saveEdit() {
  const f = editForm.value
  const ids = [f.name]
  try {
    const r1 = await post(USER_ROUTES.marks, { ids, marks: f.marks })
    if (!(r1?.code >= 1)) { notify(r1?.msg || '备注保存失败', 'danger', 3200); return }
    const r2 = await post(USER_ROUTES.meals, { ids, mealId: Number(f.mealId) || 0 })
    if (!(r2?.code >= 1)) { notify(r2?.msg || '套餐保存失败', 'danger', 3200); return }
    notify('保存成功', 'success', 2000)
  } catch (e) {
    notify(e?.message || '保存失败', 'danger', 3200)
    return
  }
  showEdit.value = false
  await load()
}

/** 取消授权（原底部按钮） */
async function forbidOne() {
  const name = editForm.value.name
  if (!(await confirm(`确定取消客户端「${name}」的授权吗？`, { okVariant: 'danger', okText: '取消授权' }))) return
  await submitAction(USER_ROUTES.forbid, { ids: [name] }, {
    reload: async () => { showEdit.value = false; await load() },
  })
}

/** 删除该行（行操作） */
async function delOne(u) {
  const name = String(u.name)
  if (!(await confirm(`确定删除客户端「${name}」吗？`, { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(USER_ROUTES.delete, { ids: [name] }, { reload: load })
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header">
        <div class="ui-inline u-gap-8">
          <h4>已授权客户端列表</h4>
          <span class="ui-hint">双击任意一行可编辑</span>
        </div>
        <span class="u-text-sm u-text-2">
          客户端总数：{{ data?.userTotal ?? 0 }} &nbsp;|&nbsp; 今日上线：{{ data?.userToday ?? 0 }}
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
                <td colspan="11" class="ui-table__status"><span class="ui-spinner" />正在加载客户端列表…</td>
              </tr>
              <tr v-else-if="!users.length">
                <td colspan="11" class="ui-table__empty">对不起，当前未有已授权的客户端数据</td>
              </tr>
              <tr v-for="u in users" :key="u.id" class="is-editable" title="双击编辑该客户端" v-rowtap="() => openEdit(u)">
                <td>{{ u.name }}</td>
                <td>{{ u.mealName }}</td>
                <td class="u-mono u-text-sm">{{ u.deviceId }}</td>
                <td>{{ u.model }}</td>
                <td>{{ u.ip }}</td>
                <td>{{ u.region }}</td>
                <td class="u-text-sm">{{ u.lastTimeStr }}</td>
                <td :title="u.expDesc">{{ u.expDays }}</td>
                <td>{{ u.author }}</td>
                <td>{{ u.marks }}</td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <button class="ui-btn ui-btn--danger ui-btn--xs" type="button" @click="delOne(u)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <AppPagination
        :page="data?.page ?? page"
        :page-count="data?.pageCount ?? 1"
        :total="data?.userTotal ?? 0"
        @page-change="changePage"
      />
    </div>

    <!-- ============ 弹窗：编辑客户端（原底部批量操作改到这里） ============ -->
    <AppModal v-model="showEdit" title="编辑客户端">
      <div class="ui-kv">账号：<span class="ui-kv__v">{{ editForm.name || '-' }}</span></div>
      <div class="ui-kv">设备ID：<span class="ui-kv__v ui-kv__v--mono">{{ editForm.deviceId || '-' }}</span></div>
      <div class="ui-kv">型号：<span class="ui-kv__v">{{ editForm.model || '-' }}</span></div>
      <div class="ui-kv">IP：<span class="ui-kv__v ui-kv__v--mono">{{ editForm.ip || '-' }}</span></div>
      <div class="ui-kv">地区：<span class="ui-kv__v">{{ editForm.region || '-' }}</span></div>
      <div class="ui-kv">最后登陆：<span class="ui-kv__v">{{ editForm.lastTimeStr || '-' }}</span></div>
      <div class="ui-kv" :title="editForm.expDesc">状态：<span class="ui-kv__v">{{ editForm.expDays || '-' }}</span></div>

      <div class="ui-field">
        <label class="ui-field__label">套餐</label>
        <select v-model="editForm.mealId" class="ui-select">
          <option value="">请选择套餐</option>
          <option v-for="m in meals" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
        </select>
      </div>

      <div class="ui-field u-mb-0">
        <label class="ui-field__label">备注</label>
        <input v-model="editForm.marks" class="ui-input" placeholder="请输入备注" @keyup.enter="saveEdit" />
      </div>

      <template #footer>
        <button class="ui-btn ui-btn--danger" type="button" @click="forbidOne">取消授权</button>
        <button class="ui-btn" type="button" @click="showEdit = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="saveEdit">保存</button>
      </template>
    </AppModal>
  </div>
</template>
