import { ref, computed } from 'vue'

// 主题切换。
const KEY = 'iptv-theme'

const theme = ref(localStorage.getItem(KEY) || 'light')

function apply(value) {
  const root = document.documentElement
  root.classList.toggle('dark', value === 'dark')
  root.dataset.theme = value
  localStorage.setItem(KEY, value)
}

apply(theme.value)

export function setTheme(value) {
  theme.value = value
  apply(value)
}

export function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    setTheme,
    toggleTheme,
  }
}
