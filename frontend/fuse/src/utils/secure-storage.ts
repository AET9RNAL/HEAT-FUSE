export class SecureStorageAdapter {
  async getItem(key: string): Promise<string | null> {
    const raw = localStorage.getItem(key)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
        return await window.safeStorageAPI.decrypt(parsed)
      }
      return raw
    } catch {
      return raw
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      const available = await window.safeStorageAPI.isAvailable()
      if (available) {
        const encrypted = await window.safeStorageAPI.encrypt(value)
        localStorage.setItem(key, JSON.stringify(encrypted))
      } else {
        localStorage.setItem(key, value)
      }
    } catch {
      localStorage.setItem(key, value)
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key)
  }
}