import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NavigationOption = 'home' | 'settings' | 'about'

export const useNavigationStore = defineStore('navigation', () => {
  const selectedOption = ref<NavigationOption>('home')

  function selectOption(option: NavigationOption) {
    selectedOption.value = option
  }

  return { selectedOption, selectOption }
})
