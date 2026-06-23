import { createClient } from '@supabase/supabase-js'
import { SecureStorageAdapter } from '../utils/secure-storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

const secureStorage = new SecureStorageAdapter()

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        storage: secureStorage,
        autoRefreshToken: true,
    }
})
