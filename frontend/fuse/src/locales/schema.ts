export interface TranslationSchema {
    common: {
        cancel: string
        confirm: string
        ok: string
        brandName: string
        gameName: string
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
