import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { supabase } from '../composables/supabase-client'
import { eventBus } from '../events/eventBus'
import { useAuthStore } from './auth'
import { logger } from '../utils/logger'

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
    let timeout: ReturnType<typeof setTimeout>
    return (...args: Parameters<T>) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => fn(...args), ms)
    }
}

export const useExtendedAuthStore = defineStore('extendedauth', () => {

    const deviceFingerprint = ref<string | null>(null)
    const deviceName = ref<string | null>(null)
    const deviceOS = ref<string | null>(null)
    const appVersion = ref<string | null>(null)
    const agentVersion = ref<string | null>(null)
    const ipAddress = ref<string | null>(null)
    const isActive = ref<boolean>(true)
    const lastActiveAt = ref<string | null>(null)
    const userEmail = ref<string | null>(null)
    const userCreatedAt = ref<string | null>(null)

    // --- Device management ---
    interface DeviceRecord {
        device_fingerprint: string
        device_name: string | null
        os: string | null
        ip_address: string | null
        is_active: boolean
        last_active_at: string | null
        created_at: string | null
    }
    const allDevices = ref<DeviceRecord[]>([])
    const isFetchingDevices = ref<boolean>(false)
    const maxDevices = ref<number>(3)

    // Batched save system
    const pendingChanges = ref<Record<string, any>>({})
    let isLoading = false
    let isReady = false

    // Promise that resolves once initExtendedAuth finishes
    let _initResolve: (() => void) | null = null
    let _initReady: Promise<void> = new Promise((r) => { _initResolve = r })

    function waitForInit(): Promise<void> { return _initReady }

    const debouncedSaveAll = debounce(async () => {
        if (Object.keys(pendingChanges.value).length === 0) return
        if (!deviceFingerprint.value) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase
            .from('extended_auth')
            .update({ ...pendingChanges.value })
            .eq('user_id', user.id)
            .eq('device_fingerprint', deviceFingerprint.value)

        if (error) {
            logger.error('Failed to save extended auth:', { error })
        } else {
            logger.info('Saved extended auth:', pendingChanges.value)
            pendingChanges.value = {}
        }
    }, 500)

    function queueSave(column: string, value: any) {
        if (isLoading || !isReady) return
        pendingChanges.value[column] = value
        debouncedSaveAll()
    }

    // Client-writable columns
    const writableMap: [Ref<any>, string][] = [
        [deviceName,   'device_name'],
        [deviceOS,     'os'],
        [appVersion,   'app_version'],
        [agentVersion, 'agent_version'],
        [ipAddress,    'ip_address'],
        [isActive,     'is_active'],
        [lastActiveAt, 'last_active_at'],
    ]

    writableMap.forEach(([refVal, column]) => {
        watch(refVal, (value) => queueSave(column, value))
    })

    async function loadSettings() {
        if (!deviceFingerprint.value) return
        isLoading = true
        try {
            const { data: deviceData, error: deviceError } = await supabase
                .from('extended_auth')
                .select('*')
                .eq('device_fingerprint', deviceFingerprint.value)
                .single()
            if (deviceError) throw deviceError
            if (deviceData) {
                for (const [refVal, column] of writableMap) {
                    if (column in deviceData) {
                        refVal.value = deviceData[column] ?? refVal.value
                    }
                }
            }
            logger.info('Loaded device settings')
        } catch (err) {
            logger.error('Failed to load settings:', { error: err })
        } finally {
            isLoading = false
        }
    }

    async function fetchDeviceInfo() {
        const [fp, name, osInfo, ip] = await Promise.all([
            window.ipcRenderer.invoke('device:fingerprint'),
            window.ipcRenderer.invoke('device:name'),
            window.ipcRenderer.invoke('device:os'),
            window.ipcRenderer.invoke('device:ip'),
        ])
        deviceFingerprint.value = fp ?? null
        deviceName.value = name ?? null
        deviceOS.value = osInfo ?? null
        ipAddress.value = ip ?? null
    }

    async function initExtendedAuth() {
        await fetchDeviceInfo()
        if (!deviceFingerprint.value) return

        let user: { id: string; email?: string; created_at?: string } | null = null
        try {
            const { data, error: authError } = await supabase.auth.getUser()
            user = data.user
            if (authError) logger.warn('getUser error:', { error: authError })

            if (user) {
                userEmail.value = user.email ?? null
                userCreatedAt.value = user.created_at ?? null

                const deviceInfo = {
                    device_name: deviceName.value,
                    os: deviceOS.value,
                    ip_address: ipAddress.value,
                    app_version: appVersion.value,
                    agent_version: agentVersion.value,
                }

                const { data: existingDevice } = await supabase
                    .from('extended_auth')
                    .select('device_fingerprint')
                    .eq('user_id', user.id)
                    .eq('device_fingerprint', deviceFingerprint.value)
                    .maybeSingle()

                if (!existingDevice) {
                    const { error: insertError } = await supabase
                        .from('extended_auth')
                        .insert({
                            user_id: user.id,
                            device_fingerprint: deviceFingerprint.value,
                            ...deviceInfo,
                        })

                    if (insertError) {
                        if (insertError.message?.includes('device_limit_reached')) {
                            const auth = useAuthStore()
                            auth.setError('Device limit reached. Please remove another device first.')
                        }
                        logger.error('Failed to init extended auth:', {
                            message: insertError.message,
                            code: insertError.code,
                        })
                        return
                    }
                } else {
                    await supabase
                        .from('extended_auth')
                        .update(deviceInfo)
                        .eq('user_id', user.id)
                        .eq('device_fingerprint', deviceFingerprint.value)
                }

                await loadSettings()
                isReady = true
            }
        } catch (err) {
            logger.warn('Supabase unreachable during init (offline):', { error: err })
        }

        if (_initResolve) {
            _initResolve()
            _initResolve = null
        }
    }

    eventBus.on('auth:success', async () => {
        if (!_initResolve) {
            _initReady = new Promise((r) => { _initResolve = r })
        }
        await initExtendedAuth()
    })

    function updateDeviceInfo(info: {
        deviceFingerprint?: string | null
        deviceName?: string | null
        deviceOS?: string | null
        ipAddress?: string | null
    }) {
        if (info.deviceFingerprint !== undefined) deviceFingerprint.value = info.deviceFingerprint
        if (info.deviceName !== undefined) deviceName.value = info.deviceName
        if (info.deviceOS !== undefined) deviceOS.value = info.deviceOS
        if (info.ipAddress !== undefined) ipAddress.value = info.ipAddress
    }

    async function fetchAllDevices(): Promise<void> {
        isFetchingDevices.value = true
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('extended_auth')
                .select('device_fingerprint, device_name, os, ip_address, is_active, last_active_at, created_at')
                .eq('user_id', user.id)
                .order('last_active_at', { ascending: false })

            if (error) {
                logger.error('Failed to fetch devices:', { error })
                return
            }
            const devices = data ?? []
            const currentIdx = devices.findIndex(d => d.device_fingerprint === deviceFingerprint.value)
            if (currentIdx > 0) {
                const [current] = devices.splice(currentIdx, 1)
                devices.unshift(current)
            }
            allDevices.value = devices
        } catch (err) {
            logger.error('Failed to fetch devices:', { error: err })
        } finally {
            isFetchingDevices.value = false
        }
    }

    async function revokeDevice(fingerprint: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return { success: false, error: 'not_signed_in' }

            if (fingerprint === deviceFingerprint.value) {
                return { success: false, error: 'cannot_revoke_current_device' }
            }

            const { error } = await supabase
                .from('extended_auth')
                .delete()
                .eq('user_id', user.id)
                .eq('device_fingerprint', fingerprint)

            if (error) {
                logger.error('Failed to revoke device:', { error })
                return { success: false, error: error.message }
            }

            await fetchAllDevices()
            return { success: true }
        } catch (err: any) {
            logger.error('Revoke device error:', { error: err })
            return { success: false, error: err.message || 'revoke_error' }
        }
    }

    eventBus.on('auth:logout', () => {
        isReady = false
        userEmail.value = null
        userCreatedAt.value = null
        allDevices.value = []
        _initReady = new Promise((r) => { _initResolve = r })
    })

    return {
        deviceFingerprint,
        deviceName,
        deviceOS,
        appVersion,
        agentVersion,
        ipAddress,
        isActive,
        lastActiveAt,
        userEmail,
        userCreatedAt,
        allDevices,
        isFetchingDevices,
        maxDevices,
        loadSettings,
        initExtendedAuth,
        updateDeviceInfo,
        fetchAllDevices,
        revokeDevice,
        waitForInit,
    }
}, {
    persist: {
        pick: [
            'deviceFingerprint',
            'deviceName',
            'deviceOS',
            'appVersion',
            'agentVersion',
            'lastActiveAt',
            'userEmail',
            'userCreatedAt',
        ],
    },
})
