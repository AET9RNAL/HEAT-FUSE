import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NavigationOption = 'home' | 'discover' | 'settings' | 'about' | 'account'

export const useNavigationStore = defineStore('navigation', () => {
  const selectedOption = ref<NavigationOption>('home')

  function selectOption(option: NavigationOption) {
    selectedOption.value = option
  }

  return { selectedOption, selectOption }
})
