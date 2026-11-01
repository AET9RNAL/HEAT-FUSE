import { useI18n } from './useI18n'
import { useSamplePlugins } from './useSamplePlugins'
import { useAppStore } from '../stores/app'
import { useMarketplaceStore } from '../stores/marketplace'
import { useNavigationStore, type NavigationOption } from '../stores/navigation'
import { startFtue, ftue, type FtueStep, type FtueTour } from '../directives/vFtue'

const TOUR_ID = 'app-intro'

/**
 * `tab` opens the page that holds the target, on Next and on Back. Sidebar steps keep the page.
 * `sample` marks steps that show the plugin list, which holds sample plugins for a new user.
 */
type StepDef = Omit<FtueStep, 'title' | 'body' | 'before' | 'sample'> & {
    key: string
    tab?: NavigationOption
    sample?: boolean
}

const STEPS: StepDef[] = [
    { key: 'welcome',       tab: 'home' },
    { key: 'nav',           target: 'nav',               side: 'right',  align: 'start' },
    { key: 'plugins',       tab: 'home',     target: 'home-plugins',      side: 'top',    sample: true },
    { key: 'pluginTypes',   tab: 'home',     target: 'home-plugins',      side: 'top',    sample: true },
    { key: 'search',        tab: 'home',     target: 'home-search',       side: 'bottom', sample: true },
    { key: 'views',         tab: 'home',     target: 'home-views',        side: 'bottom', align: 'start', sample: true },
    { key: 'discover',      tab: 'discover', target: 'discover-tabs',     side: 'bottom', align: 'start' },
    { key: 'discoverTools', tab: 'discover', target: 'discover-tools',    side: 'bottom' },
    { key: 'account',       target: 'nav-account',       side: 'right',  align: 'end' },
    { key: 'settings',      tab: 'settings', target: 'settings-core',     side: 'bottom' },
    { key: 'platform',      tab: 'settings', target: 'settings-platform', side: 'bottom', align: 'start' },
    { key: 'gameDir',       tab: 'settings', target: 'settings-gamedir',  side: 'bottom' },
    { key: 'gameConfig',    tab: 'settings', target: 'settings-config',   side: 'bottom', align: 'end' },
    { key: 'keybinds',      tab: 'settings', target: 'settings-keybinds', side: 'top' },
    { key: 'launch',        tab: 'home',     target: 'home-launch',       side: 'bottom', sample: true },
    { key: 'about',         target: 'nav-about',         side: 'right',  align: 'start' },
]

/** The launcher's intro tour: runs once after onboarding, replays from About. */
export function useAppTour() {
    const { t } = useI18n()
    const appStore = useAppStore()
    const navStore = useNavigationStore()
    const marketplace = useMarketplaceStore()
    const samples = useSamplePlugins()
    const showsSamples = (): boolean => samples.active.value

    function openTab(tab: NavigationOption): void {
        navStore.selectOption(tab)
        // An open plugin page hides the marketplace grid and its toolbar.
        if (tab === 'discover') marketplace.selectProject(null)
    }

    function build(): FtueTour {
        return {
            id: TOUR_ID,
            steps: STEPS.map(({ key, tab, sample, ...step }) => ({
                ...step,
                title: t(`apptour.${key}.title`),
                body: t(`apptour.${key}.body`),
                before: tab ? () => openTab(tab) : undefined,
                sample: sample ? showsSamples : undefined,
            })),
        }
    }

    async function play(): Promise<void> {
        const result = await startFtue(build())
        if (result === 'cancelled') return
        if (!appStore.ftueSeen.includes(TOUR_ID)) appStore.ftueSeen = [...appStore.ftueSeen, TOUR_ID]
    }

    function runOnce(): void {
        if (ftue.tour || appStore.ftueSeen.includes(TOUR_ID)) return
        void play()
    }

    function replay(): void {
        void play()
    }

    return { runOnce, replay }
}
