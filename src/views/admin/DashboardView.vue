<script setup>
// 仪表盘 —— 重构自 admin_index.html。
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePageData } from '@/utils/page'
import AppIcon from '@/components/AppIcon.vue'
import { post } from '@/api/http'
import { API } from '@/api/endpoints'

const router = useRouter()
const { data, loading, load } = usePageData((q) => post(API.adminIndexData, q))

onMounted(() => load())

const stats = computed(() => {
  const d = data.value || {}
  return [
    { key: 'userTotal', label: '客户端总数', value: d.userTotal ?? 0, icon: 'user', variant: 'primary', to: '/admin/users' },
    { key: 'userToday', label: '今日上线', value: d.userToday ?? 0, icon: 'up', variant: 'purple', to: '/admin/users' },
    { key: 'channelTypeCount', label: '可用频道分类数量', value: d.channelTypeCount ?? 0, icon: 'epg', variant: 'cyan', to: '/admin/channels' },
    { key: 'mealsCount', label: '可用套餐数量', value: d.mealsCount ?? 0, icon: 'meal', variant: 'info', to: '/admin/meals' },
    { key: 'epgCount', label: '可用EPG数量', value: d.epgCount ?? 0, icon: 'clipboard', variant: 'warning', to: '/admin/epgsList' },
    { key: 'channelCount', label: '可用频道总数量', value: d.channelCount ?? 0, icon: 'tv', variant: 'brown', to: '/admin/channels' },
  ]
})

const typeList = computed(() => data.value?.channelTypeList || [])

function openStat(s) {
  if (s.to) router.push(s.to)
}
</script>

<template>
  <div>
    <div v-if="loading && !data" class="ui-card">
      <div class="ui-card__body">
        <div class="ui-table__status"><span class="ui-spinner" />正在加载统计数据…</div>
      </div>
    </div>

    <template v-else>
      <div class="ui-grid ui-grid--stats">
        <div
          v-for="s in stats"
          :key="s.key"
          class="ui-stat"
          :class="[`ui-stat--${s.variant}`, { 'ui-stat--link': s.to }]"
          :role="s.to ? 'link' : null"
          :tabindex="s.to ? 0 : null"
          :title="s.to ? `查看${s.label}` : null"
          @click="openStat(s)"
          @keyup.enter="openStat(s)"
        >
          <div>
            <p class="ui-stat__label">{{ s.label }}</p>
            <p class="ui-stat__value">{{ s.value }}</p>
          </div>
          <div class="ui-stat__icon"><AppIcon :name="s.icon" :size="21" /></div>
        </div>
      </div>

      <div class="ui-card u-mt-16">
        <div class="ui-card__header"><h4>可用频道分类统计</h4></div>
        <div class="ui-card__body ui-card__body--flush">
          <div class="ui-table-wrap">
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="u-center" style="width: 70px">#</th>
                  <th>频道分类</th>
                  <th class="u-center">订阅源频道数量</th>
                  <th class="u-center">分类频道数量(去重后)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!typeList.length">
                  <td colspan="4" class="ui-table__empty">暂无频道分类数据</td>
                </tr>
                <tr v-for="t in typeList" :key="t.num">
                  <td class="u-center">{{ t.num }}</td>
                  <td>{{ t.name }}</td>
                  <td class="u-center">{{ t.showRawCount ? t.rawCount : '-' }}</td>
                  <td class="u-center">{{ t.channelCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
