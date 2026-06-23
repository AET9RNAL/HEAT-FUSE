import { ref, readonly } from 'vue'
import { logger } from '../utils/logger'
import { eventBus } from '../events/eventBus'

// ── Constants ──────────────────────────────────────────────────────────────

const HEALTH_RETRIES = 5
const HEALTH_RETRY_MS = 500
const WS_CONNECT_TIMEOUT_MS = 5_000
const AUTH_TIMEOUT_MS = 5_000
const RPC_TIMEOUT_MS = 10_000
const HEARTBEAT_INTERVAL_MS = 30_000
const RECONNECT_DELAYS = [1_000, 2_000, 5_000]

// ── Singleton module state ─────────────────────────────────────────────────

const connected = ref(false)
const error = ref<string | null>(null)

let _ws: WebSocket | null = null
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _reconnectAttempt = 0
let _intentionalClose = false
let _currentPort: number | null = null
let _currentToken: string | null = null
let _nextRpcId = 1
let _onNotification: ((msg: Record<string, unknown>) => void) | null = null

const _pending = new Map<number, {
    resolve: (v: Record<string, unknown>) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
}>()

// ── Health check ───────────────────────────────────────────────────────────

async function _healthCheck(port: number): Promise<boolean> {
    for (let i = 0; i < HEALTH_RETRIES; i++) {
        try {
            await fetch(`http://127.0.0.1:${port}/health`)
            return true
        } catch {
            if (i < HEALTH_RETRIES - 1) {
                await new Promise(r => setTimeout(r, HEALTH_RETRY_MS))
            }
        }
    }
    return false
}

// ── Message dispatch ───────────────────────────────────────────────────────

function _handleMessage(data: string): void {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(data) } catch { return }

    if (msg['type'] === 'heartbeat_ack') return

    // Typed server notification
    if (typeof msg['type'] === 'string' && !msg['jsonrpc']) {
        try {
            eventBus.emit(msg['type'] as Parameters<typeof eventBus.emit>[0], msg as never)
        } catch { /* unknown event key — safe to ignore */ }
        _onNotification?.(msg)
        return
    }

    // JSON-RPC response
    if (msg['jsonrpc'] === '2.0' && msg['id'] != null) {
        const req = _pending.get(msg['id'] as number)
        if (req) {
            clearTimeout(req.timer)
            _pending.delete(msg['id'] as number)
            req.resolve(msg)
        }
    }
}

// ── JSON-RPC send ──────────────────────────────────────────────────────────

async function send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) throw new Error('not connected')
    const id = _nextRpcId++
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            _pending.delete(id)
            reject(new Error(`RPC timeout: ${method}`))
        }, RPC_TIMEOUT_MS)
        _pending.set(id, { resolve, reject, timer })
        _ws!.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }))
    })
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

function _startHeartbeat(): void {
    _stopHeartbeat()
    _heartbeatTimer = setInterval(() => {
        if (_ws?.readyState === WebSocket.OPEN) {
            _ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }))
        }
    }, HEARTBEAT_INTERVAL_MS)
}

function _stopHeartbeat(): void {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null }
}

// ── Auto-reconnect ─────────────────────────────────────────────────────────

function _scheduleReconnect(): void {
    if (_intentionalClose || _currentPort === null || _currentToken === null) return
    if (_reconnectAttempt >= RECONNECT_DELAYS.length) {
        error.value = 'max_reconnect_attempts'
        eventBus.emit('fuse:stalled', { stale_seconds: 8 })
        logger.error('FUSE: max reconnect attempts reached')
        return
    }
    const delay = RECONNECT_DELAYS[_reconnectAttempt++]
    _reconnectTimer = setTimeout(async () => {
        try {
            await _doConnect(_currentPort!, _currentToken!)
        } catch {
            _scheduleReconnect()
        }
    }, delay)
}

// ── Core WebSocket connect ─────────────────────────────────────────────────

async function _doConnect(port: number, token: string): Promise<void> {
    const healthy = await _healthCheck(port)
    if (!healthy) throw new Error('health check failed')

    await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`)
        const connectTimeout = setTimeout(() => {
            socket.close()
            reject(new Error('websocket connect timeout'))
        }, WS_CONNECT_TIMEOUT_MS)

        socket.onopen = () => {
            clearTimeout(connectTimeout)

            // Single-step auth: send token, wait for auth:ok
            const authTimeout = setTimeout(() => {
                socket.close()
                reject(new Error('auth timeout'))
            }, AUTH_TIMEOUT_MS)

            socket.onmessage = (e: MessageEvent) => {
                let msg: Record<string, unknown>
                try { msg = JSON.parse(e.data) } catch { socket.close(); reject(new Error('bad auth response')); return }

                clearTimeout(authTimeout)

                if (msg['type'] !== 'auth:ok') {
                    socket.close()
                    reject(new Error('auth rejected'))
                    return
                }

                // Connected successfully
                _ws = socket
                connected.value = true
                error.value = null
                _reconnectAttempt = 0
                _startHeartbeat()

                socket.onmessage = (e: MessageEvent) => _handleMessage(e.data)
                socket.onclose = () => {
                    _ws = null
                    connected.value = false
                    _stopHeartbeat()
                    if (!_intentionalClose) {
                        error.value = 'disconnected'
                        _scheduleReconnect()
                    }
                }

                resolve()
            }

            socket.send(JSON.stringify({ type: 'auth', token }))
        }

        socket.onerror = () => {
            clearTimeout(connectTimeout)
            reject(new Error('websocket error'))
        }
    })
}

// ── Public API ─────────────────────────────────────────────────────────────

async function connect(port: number, token: string): Promise<void> {
    _intentionalClose = false
    _currentPort = port
    _currentToken = token
    _reconnectAttempt = 0
    await _doConnect(port, token)
}

function disconnect(): void {
    _intentionalClose = true
    _currentPort = null
    _currentToken = null
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
    _stopHeartbeat()
    if (_ws) { _ws.close(); _ws = null }
    connected.value = false
    error.value = null
    for (const req of _pending.values()) {
        clearTimeout(req.timer)
        req.reject(new Error('disconnected'))
    }
    _pending.clear()
}

async function setFuseConfig(config: Record<string, unknown>): Promise<void> {
    const resp = await send('config.update', config)
    if (resp['error']) throw new Error(`config.update failed: ${(resp['error'] as { message: string }).message}`)
}

async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const resp = await send('plugin.setEnabled', { plugin_id: pluginId, enabled })
    if (resp['error']) throw new Error(`plugin.setEnabled failed: ${(resp['error'] as { message: string }).message}`)
}

async function rebindHotkey(pluginId: string, action: string, combo: string): Promise<void> {
    const resp = await send('hotkey.rebind', { plugin_id: pluginId, action, combo })
    if (resp['error']) throw new Error(`hotkey.rebind failed: ${(resp['error'] as { message: string }).message}`)
}

function onNotification(cb: (msg: Record<string, unknown>) => void): void {
    _onNotification = cb
}

export function useFuseConnection() {
    return {
        connected: readonly(connected),
        error: readonly(error),
        connect,
        disconnect,
        send,
        setFuseConfig,
        setPluginEnabled,
        rebindHotkey,
        onNotification,
    }
}
