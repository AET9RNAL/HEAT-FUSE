import { watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../stores/app'
import { useNavigationStore } from '../stores/navigation'
import { usePluginsStore } from '../stores/plugins'

export function useDiscordPresence() {
  const appStore = useAppStore()
  const navStore = useNavigationStore()
  const pluginsStore = usePluginsStore()

  const { discordRpc, enableFuse, gameVersion } = storeToRefs(appStore)
  const { selectedOption } = storeToRefs(navStore)

  const sectionLabel: Record<string, string> = {
    home:     'Browsing Mods',
    discover: 'Discovering Mods',
    settings: 'Tweaking Settings',
    about:    'About FUSE',
  }

  function pushActivity() {
    if (!window.discordAPI) return
    if (!discordRpc.value) return

    const details = sectionLabel[selectedOption.value] ?? 'In FUSE'
    const enabledCount = pluginsStore.plugins?.filter(p => p.status !== 'disabled').length ?? 0
    const totalCount = pluginsStore.plugins?.length ?? 0

    const state = enableFuse.value
      ? `FUSE Active · ${enabledCount}/${totalCount} mods`
      : gameVersion.value
        ? `WoT:HEAT ${gameVersion.value}`
        : 'Idle'

    window.discordAPI.setActivity({
      details,
      state,
      largeImageKey: 'fuse_logo',
      largeImageText: 'WoT:HEAT - FUSE',
      smallImageKey: enableFuse.value ? 'fuse_on' : 'fuse_off',
      smallImageText: enableFuse.value ? 'Runtime Active' : 'Runtime Idle',
      buttons: [
        { label: 'Get FUSE', url: 'https://github.com/AET9RNAL/HEAT-FUSE' },
      ],
    })
  }

  // React to relevant state changes
  const stopHandles = [
    watch(discordRpc, (enabled) => {
      if (enabled) pushActivity()
      else window.discordAPI?.clearActivity()
    }, { immediate: true }),
    watch(selectedOption, pushActivity),
    watch(enableFuse, pushActivity),
    watch(gameVersion, pushActivity),
    watch(() => pluginsStore.plugins?.length, pushActivity),
    watch(() => pluginsStore.plugins?.filter(p => p.status !== 'disabled').length, pushActivity),
  ]

  onUnmounted(() => {
    stopHandles.forEach(stop => stop())
  })
}
