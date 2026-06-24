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
      icon="home"
      :label="t('appnav.home')"
      :selected="store.selectedOption === 'home'"
      @select="handleSelect('home')"
    />
    <SidebarOption
      icon="discover"
      :label="t('appnav.discover')"
      :selected="store.selectedOption === 'discover'"
      @select="handleSelect('discover')"
    />
    <SidebarOption
      icon="settings"
      :label="t('appnav.settings')"
      :selected="store.selectedOption === 'settings'"
      @select="handleSelect('settings')"
    />
    <SidebarOption
      icon="about"
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
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2);
  margin: 0;
  background: var(--base-900);
  height: 100%;
  flex-shrink: 0;
}
</style>
