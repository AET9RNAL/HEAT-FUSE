<script setup lang="ts">
import { computed } from 'vue'
import SidebarOption from './SidebarOption.vue'
import Icons from './Icons.vue'
import { useNavigationStore, type NavigationOption } from '../stores/navigation'
import { useAuthStore } from '../stores/auth'

const store = useNavigationStore()
const auth = useAuthStore()

const signedIn = computed(() => auth.isSignedIn())

function handleSelect(option: NavigationOption) {
  store.selectOption(option)
}
</script>

<template>
  <ul class="sidebar">
    <SidebarOption
      icon="home"
      :selected="store.selectedOption === 'home'"
      @select="handleSelect('home')"
    />
    <SidebarOption
      icon="discover"
      :selected="store.selectedOption === 'discover'"
      @select="handleSelect('discover')"
    />
    <SidebarOption
      icon="settings"
      :selected="store.selectedOption === 'settings'"
      @select="handleSelect('settings')"
    />
    <SidebarOption
      icon="about"
      :selected="store.selectedOption === 'about'"
      @select="handleSelect('about')"
    />

    <!-- signed in: SidebarOption → account settings tab -->
    <SidebarOption
      v-if="signedIn"
      icon="user"
      :selected="store.selectedOption === 'account'"
      class="auth-bottom"
      @select="handleSelect('account')"
    />
    <!-- signed out: plain icon → open auth flow -->
    <li
      v-else
      class="auth-icon-btn auth-bottom"
      @click="auth.setScreen('welcome')"
    >
      <Icons kind="sign-in" size="large" />
    </li>
  </ul>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-4);
  margin: 0;
  background: var(--base-900);
  height: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

.auth-bottom {
  margin-top: auto;
}

.auth-icon-btn {
  list-style: none;
  cursor: pointer;
  padding: var(--space-1);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.auth-icon-btn:hover {
  opacity: 1;
}
</style>
