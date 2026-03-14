import { describe, it, expect, beforeEach } from 'vitest'
import { usePreferencesStore } from './preferences-store'

beforeEach(() => {
  usePreferencesStore.setState({ theme: 'system', language: 'zh-CN', sidebarCollapsed: false })
})

describe('usePreferencesStore', () => {
  it('has correct default values', () => {
    const state = usePreferencesStore.getState()
    expect(state.theme).toBe('system')
    expect(state.language).toBe('zh-CN')
    expect(state.sidebarCollapsed).toBe(false)
  })

  it('setTheme changes theme', () => {
    usePreferencesStore.getState().setTheme('dark')
    expect(usePreferencesStore.getState().theme).toBe('dark')
  })

  it('setLanguage changes language and sets localStorage', () => {
    usePreferencesStore.getState().setLanguage('en-US')
    expect(usePreferencesStore.getState().language).toBe('en-US')
    expect(localStorage.getItem('language')).toBe('en-US')
  })

  it('toggleSidebar toggles sidebarCollapsed to true', () => {
    usePreferencesStore.getState().toggleSidebar()
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)
  })

  it('toggleSidebar toggles back to false', () => {
    usePreferencesStore.getState().toggleSidebar()
    usePreferencesStore.getState().toggleSidebar()
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
  })
})
