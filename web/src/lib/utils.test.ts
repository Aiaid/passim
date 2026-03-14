import { describe, it, expect } from 'vitest'
import { cn, formatBytes, formatUptime, localized } from './utils'

describe('formatBytes', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('returns "1 KB" for 1024 bytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('returns "1.5 KB" for 1536 bytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('returns "1 GB" for 1073741824 bytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })
})

describe('formatUptime', () => {
  it('returns "0m" for 30 seconds', () => {
    expect(formatUptime(30)).toBe('0m')
  })

  it('returns "1m" for 90 seconds (floors minutes)', () => {
    expect(formatUptime(90)).toBe('1m')
  })

  it('returns "1h 1m" for 3700 seconds', () => {
    expect(formatUptime(3700)).toBe('1h 1m')
  })

  it('returns "1d 1h" for 90061 seconds', () => {
    expect(formatUptime(90061)).toBe('1d 1h')
  })
})

describe('localized', () => {
  it('returns exact match for lang', () => {
    expect(localized({ 'zh-CN': '中文', 'en-US': 'English' }, 'zh-CN')).toBe('中文')
  })

  it('falls back to en-US when lang not found', () => {
    expect(localized({ 'en-US': 'English' }, 'fr-FR')).toBe('English')
  })

  it('falls back to zh-CN when lang and en-US not found', () => {
    expect(localized({ 'zh-CN': '中文' }, 'fr-FR')).toBe('中文')
  })

  it('returns empty string for undefined map', () => {
    expect(localized(undefined, 'en-US')).toBe('')
  })

  it('returns empty string for empty map', () => {
    expect(localized({}, 'en-US')).toBe('')
  })
})

describe('cn', () => {
  it('merges multiple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('resolves tailwind-merge conflicts (last wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })
})
