<script setup lang="ts">
import SidebarOption from './SidebarOption.vue'
import { useNavigationStore, type NavigationOption } from '../stores/navigation'
import { useI18n } from '../composables/useI18n'

const store = useNavigationStore()
const { t } = useI18n()

function handleSelect(option: NavigationOption) {
  store.selectOption(option)
}
</script>

<template>
  <ul class="sidebar">
    <SidebarOption
      icon="missing"
      :label="t('appnav.home')"
      :selected="store.selectedOption === 'home'"
      @select="handleSelect('home')"
    />
    <SidebarOption
      icon="missing"
      :label="t('appnav.settings')"
      :selected="store.selectedOption === 'settings'"
      @select="handleSelect('settings')"
    />
    <SidebarOption
      icon="missing"
      :label="t('appnav.plugins')"
      :selected="store.selectedOption === 'plugins'"
      @select="handleSelect('plugins')"
    />
    <SidebarOption
      icon="missing"
      :label="t('appnav.about')"
      :selected="store.selectedOption === 'about'"
      @select="handleSelect('about')"
    />
  </ul>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-1);
  margin: 0;
  background: var(--base-1000);
  height: 100%;
  flex-shrink: 0;
}
</style>
