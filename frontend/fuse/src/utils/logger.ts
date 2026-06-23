type LogData = Record<string, unknown>

export const logger = {
  info: (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.info(msg, data ?? '') },
  warn: (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.warn(msg, data ?? '') },
  error: (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.error(msg, data ?? '') },
}
