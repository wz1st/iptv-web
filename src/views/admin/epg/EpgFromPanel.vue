<script setup>
// EPG来源管理 —— 重构自 admin_epgs_list.html。
import { ref, onMounted, computed } from 'vue'
import { post } from '@/api/http'
import { submitAction, submitSwitch } from '@/utils/page'
import { confirm } from '@/utils/confirm'
import { notify } from '@/utils/feedback'
import { API, EPG_FROM_ROUTES as A } from '@/api/endpoints'
import AppModal from '@/components/AppModal.vue'
import { Switch } from '@/components/ui/switch'

const data = ref(null)
const loading = ref(false)
const list = computed(() => (data.value?.epgFromDb || []).filter((e) => e.url))

async function load() {
  loading.value = true
  try {
    data.value = await post(API.adminEpgFromData)
  } catch { /* 已处理 */ } finally {
    loading.value = false
  }
}
onMounted(load)

const showImport = ref(false)
const form = ref({ eid: '', epgfromname: '', epgfromurl: '', epgfromua: '' })

function openAdd() {
  form.value = { eid: '', epgfromname: '', epgfromurl: '', epgfromua: '' }
  showImport.value = true
}

/** 回填直接读行对象，不再经由行内隐藏 <td> 的 data-value */
function openEdit(e) {
  form.value = {
    eid: String(e.id ?? ''),
    epgfromname: e.name ?? '',
    epgfromurl: e.url ?? '',
    epgfromua: e.ua ?? '',
  }
  showImport.value = true
}

async function save() {
  if (!form.value.epgfromname || !form.value.epgfromurl) {
    notify('请填写 EPG 源名称与地址', 'warning')
    return
  }
  await submitAction(
    A.save,
    {
      id: Number(form.value.eid) || 0,
      name: form.value.epgfromname,
      url: form.value.epgfromurl,
      ua: form.value.epgfromua,
    },
    { reload: async () => { showImport.value = false; await load() } }
  )
}

const updateAll = () => submitAction(A.updateAll, {}, { reload: load })
const updateOne = (id) => submitAction(A.update, { id }, { reload: load })

/** 上线/下线：只改本地这一行，不重取整页；失败回滚 + 右下角提示 */
function onToggleStatus(e) {
  const next = !e.status
  return submitSwitch(
    A.status,
    { id: e.id },
    {
      apply: () => { e.status = next },
      revert: () => { e.status = !next },
      successMsg: next ? '已上线' : '已下线',
    }
  )
}

async function del(id) {
  if (!(await confirm('确定删除该 EPG 源吗？', { okVariant: 'danger', okText: '删除' }))) return
  await submitAction(A.delete, { id }, { reload: load })
}
</script>

<template>
  <div>
    <div class="ui-card">
      <div class="ui-card__header">
        <h4>EPG源管理</h4>
        <span class="ui-hint">双击任意一行可编辑</span>
      </div>

      <div class="ui-card__toolbar">
        <div class="ui-inline u-gap-8">
          <button class="ui-btn ui-btn--sm" type="button" @click="updateAll">更新全部</button>
          <button class="ui-btn ui-btn--primary ui-btn--sm" type="button" @click="openAdd">导入epg源</button>
        </div>
      </div>

      <div class="ui-card__body ui-card__body--flush">
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="u-center" style="width: 160px">名称</th>
                <th>url</th>
                <th class="u-center" style="width: 160px">更新时间</th>
                <th class="u-center" style="width: 80px">状态</th>
                <th class="u-center" style="width: 170px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="ui-table__status"><span class="ui-spinner" />正在加载 EPG 源…</td>
              </tr>
              <tr v-else-if="!list.length">
                <td colspan="5" class="ui-table__empty">当前未有 EPG 源数据</td>
              </tr>
              <tr v-for="e in list" :key="e.id" class="is-editable" title="双击编辑该 EPG 源" v-rowtap="() => openEdit(e)">
                <td class="u-center">{{ e.name }}</td>
                <td class="u-text-sm" style="word-break: break-all">
                  <a :href="e.url" target="_blank" rel="noopener">{{ e.url }}</a>
                </td>
                <td class="u-center u-text-sm">{{ e.lastTimeStr }}</td>
                <!-- 状态与上线/下线合并成一列开关；双击整行打开编辑 -->
                <td class="u-center" @dblclick.stop>
                  <Switch
                    :model-value="e.status"
                    :aria-label="e.status ? '点击下线' : '点击上线'"
                    @update:model-value="onToggleStatus(e)"
                  />
                </td>
                <td class="u-center" @dblclick.stop>
                  <div class="ui-table__actions">
                    <button class="ui-btn ui-btn--info ui-btn--xs" type="button" @click="updateOne(e.id)">更新</button>
                    <button class="ui-btn ui-btn--danger ui-btn--xs" type="button" @click="del(e.id)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <AppModal v-model="showImport" :title="form.eid ? '编辑EPG源' : '导入epg源'">
      <div class="ui-field">
        <label class="ui-field__label">epg源名称</label>
        <input v-model="form.epgfromname" class="ui-input" placeholder="请输入名称" />
      </div>
      <div class="ui-field">
        <label class="ui-field__label">epg源url地址</label>
        <input v-model="form.epgfromurl" class="ui-input ui-input--mono" placeholder="请输入epg源地址" />
      </div>
      <div class="ui-field u-mb-0">
        <label class="ui-field__label">User-Agent</label>
        <input v-model="form.epgfromua" class="ui-input" placeholder="Go-http-client/1.1" />
      </div>

      <template #footer>
        <button class="ui-btn" type="button" @click="showImport = false">关闭</button>
        <button class="ui-btn ui-btn--primary" type="button" @click="save">保存</button>
      </template>
    </AppModal>
  </div>
</template>
