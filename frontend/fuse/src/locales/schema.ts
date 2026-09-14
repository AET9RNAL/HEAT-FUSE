export interface TranslationSchema {
    common: {
        cancel: string
        confirm: string
        ok: string
        brandName: string
        gameName: string
        close: string
    }
    apptitlebar: {
        close: string
        minimize: string
        maximize: string
        windowControls: string
    }
    appnav: {
        home: string
        discover: string
        settings: string
        plugins: string
        about: string
    }
    apphome: {
        searchPlaceholder: string
        discover: string
        filtering: string
        refresh: string
        filters: {
            all: string
            active: string
            disabled: string
        }
    }
    applaunch: {
        launch: string
        stop: string
        showInExplorer: string
        versionFallback: string
        calibratePrompt: string
        calibrateHint: string
        lockedPrompt: string
        copyObsUrl: string
        copyObsUrlFor: string
        obsUrlCopied: string
        autoLockOn: string
        autoLockOff: string
        launchTip: string
        stopTip: string
        notifications: {
            fuseDisabledTitle: string
            fuseDisabledMessage: string
            noGamePathTitle: string
            noGamePathMessage: string
        }
    }
    appsettings: {
        gameInstallation: {
            title: string
            platform: string
            gameDirectory: string
        }
        masterSwitch: {
            title: string
            enableFuse: string
            enable: string
            disable: string
        }
        general: {
            title: string
            launchAtStartup: string
            startMinimized: string
            closeMinimizes: string
            checkUpdates: string
            discordRpc: string
            fileAssoc: string
        }
        qol: {
            title: string
            startWithGame: string
            hideOnFocusLoss: string
        }
        audio: {
            title: string
            volume: string
            muted: string
        }
        notifications: {
            gameConfigChangedTitle: string
            gameConfigChangedMessage: string
            invalidPathTitle: string
            invalidPathMessage: string
        }
        keybindings: {
            title: string
            columnAction: string
            columnBinding: string
            rebind: string
            latinOnlyTitle: string
            latinOnly: string
        }
    }
    appabout: {
        wip: string
    }
    appdiscover: {
        wip: string
    }
    components: {
        loading: string
        error: string
        button: {
            processing: string
            success: string
            error: string
            confirm: string
        }
        status: {
            none: string
            initializing: string
            connecting: string
            running: string
            error: string
        }
        notification: {
            defaultTitle: string
            dependencyErrorTitle: string
            dependencyErrorMessage: string
            dismiss: string
        }
        dirSelector: {
            placeholder: string
        }
        pluginList: {
            columnPlugin: string
            columnVersion: string
            columnStatus: string
            columnActions: string
            emptyNoPlugins: string
            emptyNoMatch: string
        }
        plugin: {
            by: string
            status: {
                active: string
                error: string
                pending: string
                loading: string
                skipped: string
                disabled: string
            }
            menu: {
                settings: string
                showInExplorer: string
                delete: string
            }
            reloadWarningTitle: string
            reloadWarningMessage: string
        }
        releaseNotes: {
            title: string
            version: string
            loading: string
            empty: string
            viewOnline: string
            close: string
        }
        contextMenu: {
            more: string
        }
        console: {
            searchPlaceholder: string
            clear: string
            empty: string
            filters: {
                all: string
                error: string
                warn: string
                info: string
            }
        }
    }
}
