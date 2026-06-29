import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase, supabaseConfigured } from '../composables/supabase-client'
import { eventBus } from '../events/eventBus'

export type AuthState = 'login' | 'signup'
export type ScreenState = 'welcome' | 'auth' | 'otp' | 'main' | 'reset-password' | 'forgot-password'
export type Email = string
export type Password = string
export type Session = any

export const ERROR_TIMEOUT = 5 // seconds

export const useAuthStore = defineStore('auth', () => {
    const state = ref<AuthState>('login')
    const screen = ref<ScreenState>('main')
    const email = ref<Email>('')
    const password = ref<Password>('')
    const session = ref<Session | null>(null)
    const loading = ref<boolean>(false)
    const error = ref<string | null>(null)
    const errorTimeRemaining = ref<number>(0)
    let errorInterval: ReturnType<typeof setInterval> | null = null
    const success = ref<boolean>(false)
    const emailDeliveryStatus = ref<string>('none')
    function setState(newState: AuthState) {
        state.value = newState
    }
    function setEmail(newEmail: Email) { email.value = newEmail }
    function setPassword(newPassword: Password) { password.value = newPassword }
    function setSession(newSession: Session | null) {
        session.value = newSession
    }
    function clearForm() {
        email.value = ''
        password.value = ''
        error.value = null
    }

    function clearErrorTimer() {
        if (errorInterval) {
            clearInterval(errorInterval)
            errorInterval = null
        }
        errorTimeRemaining.value = 0
    }

    function setError(message: string | null, duration = ERROR_TIMEOUT) {
        clearErrorTimer()
        error.value = message

        if (message && duration > 0) {
            errorTimeRemaining.value = duration
            const tick = 0.05 // 50ms tick for smooth countdown

            errorInterval = setInterval(() => {
                errorTimeRemaining.value -= tick
                if (errorTimeRemaining.value <= 0) {
                    clearErrorTimer()
                    error.value = null
                }
            }, tick * 1000)
        }
    }

    function setScreen(newScreen: ScreenState) {
        screen.value = newScreen
    }

    async function signIn() {
        loading.value = true
        setError(null)
        success.value = false
        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: email.value,
                password: password.value
            })
            if (signInError) throw signInError
            session.value = data.session
            success.value = true
            clearForm()
            setScreen('main')
            eventBus.emit('auth:success')
            return { success: true, data }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Unknown error')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function signUp() {
        loading.value = true
        setError(null)
        success.value = false
        try {
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: email.value,
                password: password.value
            })
            if (signUpError) throw signUpError
            // Check if user already exists (Supabase returns empty identities array)
            if (data.user && data.user.identities?.length === 0) {
                throw new Error('An account with this email already exists')
            }
            success.value = true
            password.value = ''
            setScreen('otp')
            return { success: true, data }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Unknown error')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function logOut() {
        loading.value = true
        setError(null)
        try {
            const { error: logOutError } = await supabase.auth.signOut()
            if (logOutError) throw logOutError
            session.value = null
            success.value = false
            clearForm()
            eventBus.emit('auth:logout')
            return { success: true }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Unknown error')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }
    async function signOutAllSessions() {
        loading.value = true
        setError(null)
        try {
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
            if (signOutError) throw signOutError
            session.value = null
            success.value = false
            clearForm()
            eventBus.emit('auth:logout')
            return { success: true }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Unknown error')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function changePassword() {
        loading.value = true
        setError(null)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) {
                return { success: false, error: 'no_email' }
            }
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: 'fuse://reset-password'
            })
            if (resetError) throw resetError
            return { success: true }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Failed to send reset email')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function forgotPassword() {
        loading.value = true
        setError(null)
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.value, {
                redirectTo: 'fuse://reset-password'
            })
            if (resetError) throw resetError
            return { success: true }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Failed to send reset email')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function handlePasswordRecoveryDeepLink(params: Record<string, string>) {
        loading.value = true
        setError(null)
        try {
            // Handle Supabase error responses (expired link, access denied, etc.)
            if (params.error) {
                const description = params.error_description
                    ? decodeURIComponent(params.error_description.replace(/\+/g, ' '))
                    : params.error
                throw new Error(description)
            }

            if (params.code) {
                // PKCE flow
                const { data: pkceData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code)
                if (exchangeError) throw exchangeError
                if (pkceData.session) session.value = pkceData.session
            } else if (params.access_token && params.refresh_token) {
                // Implicit flow
                const { data: implicitData, error: sessionError } = await supabase.auth.setSession({
                    access_token: params.access_token,
                    refresh_token: params.refresh_token,
                })
                if (sessionError) throw sessionError
                if (implicitData.session) session.value = implicitData.session
            } else {
                throw new Error('Invalid recovery link. Please try again.')
            }
            eventBus.emit('auth:success')
            setScreen('reset-password')
        } catch (err: any) {
            setError(err.message || 'Failed to process recovery link. Please try again.')
        } finally {
            loading.value = false
        }
    }

    async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
        loading.value = true
        setError(null)
        try {
            const { error: fnError } = await supabase.functions.invoke('delete-account')
            if (fnError) throw fnError
            session.value = null
            clearForm()
            eventBus.emit('auth:logout')
            return { success: true }
        } catch (err: any) {
            setError(err.message || 'Failed to delete account')
            return { success: false, error: err.message }
        } finally {
            loading.value = false
        }
    }

    async function updatePassword(newPassword: string) {
        loading.value = true
        setError(null)
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
            if (updateError) throw updateError
            const { data: { session: refreshed } } = await supabase.auth.getSession()
            if (refreshed) session.value = refreshed
            setScreen('main')
            return { success: true }
        } catch (err: any) {
            setError(err.message || 'Failed to update password')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    async function verifyOTP(token: string) {
        loading.value = true
        setError(null)
        success.value = false
        try {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email: email.value,
                token,
                type: 'signup'
            })
            if (verifyError) throw verifyError
            // Don't set session yet - let component show success animation first
            // Component will call finalizeLogin() after animation
            success.value = true
            clearForm()
            return { success: true, data }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Invalid code')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    function finalizeLogin(newSession: Session) {
        session.value = newSession
        setScreen('main')
        eventBus.emit('auth:success')
    }

    async function resendOTP() {
        loading.value = true
        setError(null)
        try {
            const { error: resendError } = await supabase.auth.resend({
                email: email.value,
                type: 'signup'
            })
            if (resendError) throw resendError
            return { success: true }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Failed to resend code')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }
    function isSignedIn() {
        return !!session.value
    }
    
    async function checkEmailDeliveryStatus() {
        const { data } = await supabase
            .from('email_delivery_status')
            .select('status')
            .eq('email', email.value)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (data) {
            emailDeliveryStatus.value = data.status
        }
        return data?.status ?? 'none'
    }

    function resetEmailDeliveryStatus() {
        emailDeliveryStatus.value = 'none'
    }

    async function initializeAuth() {
        if (!supabaseConfigured) return { success: false }
        loading.value = true
        try {
            const { data: { session: existingSession } } = await supabase.auth.getSession()
            if (existingSession) {
                session.value = existingSession
                setScreen('main')
                eventBus.emit('auth:success')
                return { success: true, session: existingSession }
            }
            return { success: false }
        } catch (err: any) {
            setError(err.message || err.error_description || 'Session restoration failed')
            return { success: false, error: err }
        } finally {
            loading.value = false
        }
    }

    return {
        state,
        screen,
        email,
        password,
        session,
        loading,
        error,
        errorTimeRemaining,
        success,
        setState,
        setEmail,
        setPassword,
        setSession,
        setScreen,
        setError,
        clearForm,
        signIn,
        signUp,
        logOut,
        signOutAllSessions,
        forgotPassword,
        changePassword,
        deleteAccount,
        handlePasswordRecoveryDeepLink,
        updatePassword,
        verifyOTP,
        resendOTP,
        clearErrorTimer,
        isSignedIn,
        emailDeliveryStatus,
        checkEmailDeliveryStatus,
        resetEmailDeliveryStatus,
        finalizeLogin,
        initializeAuth
    }
})
