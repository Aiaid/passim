import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './auth-store'

beforeEach(() => {
  useAuthStore.setState({ token: null, expiresAt: null, isAuthenticated: false })
})

describe('useAuthStore', () => {
  it('has correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.expiresAt).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('login() sets token, expiresAt, and isAuthenticated', () => {
    useAuthStore.getState().login('my-token', '2026-12-31T00:00:00Z')
    const state = useAuthStore.getState()
    expect(state.token).toBe('my-token')
    expect(state.expiresAt).toBe('2026-12-31T00:00:00Z')
    expect(state.isAuthenticated).toBe(true)
  })

  it('login() sets auth-token in localStorage', () => {
    useAuthStore.getState().login('my-token', '2026-12-31T00:00:00Z')
    expect(localStorage.getItem('auth-token')).toBe('my-token')
  })

  it('logout() clears token and isAuthenticated', () => {
    useAuthStore.getState().login('my-token', '2026-12-31T00:00:00Z')
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.expiresAt).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('logout() removes auth-token from localStorage', () => {
    useAuthStore.getState().login('my-token', '2026-12-31T00:00:00Z')
    useAuthStore.getState().logout()
    expect(localStorage.getItem('auth-token')).toBeNull()
  })
})
