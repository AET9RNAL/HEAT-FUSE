import { createClient } from '@supabase/supabase-js'
import { SecureStorageAdapter } from '../utils/secure-storage'

const FALLBACK_URL = 'https://jypsytkbliqrwjipolhx.supabase.co'
const FALLBACK_KEY = 'sb_publishable_dGscI4LM7biAwUTjntCYVw_Eyy_yiVc'

const effectiveUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL
const effectiveKey = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || FALLBACK_KEY

const secureStorage = new SecureStorageAdapter()

export const supabase = createClient(effectiveUrl, effectiveKey, {
    auth: {
        persistSession: true,
        storage: secureStorage,
        autoRefreshToken: true,
    }
})

export const supabaseConfigured = true
