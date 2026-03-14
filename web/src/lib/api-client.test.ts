import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { ApiError, request } from './api-client'

let fetchMock: Mock

beforeEach(() => {
  fetchMock = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock)

  // Prevent jsdom navigation errors on 401 redirect
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' },
  })
})

function mockResponse(status: number, body?: unknown, ok?: boolean) {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: body !== undefined ? () => Promise.resolve(body) : () => Promise.reject(new Error('no body')),
    headers: new Headers(),
  } as unknown as Response
}

describe('request', () => {
  it('sends Authorization header when auth-token exists in localStorage', async () => {
    localStorage.setItem('auth-token', 'test-token')
    fetchMock.mockResolvedValue(mockResponse(200, { ok: true }))

    await request('/test')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer test-token')
  })

  it('does not send Authorization header when no token', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { ok: true }))

    await request('/test')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBeUndefined()
  })

  it('sets Content-Type when body is present', async () => {
    localStorage.setItem('auth-token', 'tok')
    fetchMock.mockResolvedValue(mockResponse(200, { ok: true }))

    await request('/test', { method: 'POST', body: JSON.stringify({ a: 1 }) })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('does not set Content-Type for GET requests without body', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { ok: true }))

    await request('/test')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('returns parsed JSON for 200 response', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { data: 'hello' }))

    const result = await request('/test')

    expect(result).toEqual({ data: 'hello' })
  })

  it('returns undefined for 204 response', async () => {
    fetchMock.mockResolvedValue(mockResponse(204, undefined, true))

    const result = await request('/test')

    expect(result).toBeUndefined()
  })

  it('removes token from localStorage and throws ApiError on 401', async () => {
    localStorage.setItem('auth-token', 'will-be-removed')
    fetchMock.mockResolvedValue(mockResponse(401, undefined, false))

    await expect(request('/test')).rejects.toThrow(ApiError)
    expect(localStorage.getItem('auth-token')).toBeNull()
  })

  it('throws ApiError with message from JSON body on 500', async () => {
    fetchMock.mockResolvedValue(mockResponse(500, { error: 'Server broke' }, false))

    try {
      await request('/test')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
      expect((err as ApiError).message).toBe('Server broke')
    }
  })

  it('throws ApiError with "Unknown error" when 500 has no JSON body', async () => {
    const badResponse = {
      status: 500,
      ok: false,
      json: () => Promise.reject(new Error('not json')),
      headers: new Headers(),
    } as unknown as Response
    fetchMock.mockResolvedValue(badResponse)

    try {
      await request('/test')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).message).toBe('Unknown error')
    }
  })

  it('ApiError is an instance of Error', () => {
    const err = new ApiError(404, 'Not found')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
  })
})
