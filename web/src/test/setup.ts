import '@testing-library/jest-dom/vitest'

// Mock window.matchMedia (needed by theme logic)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock EventSource (SSE tests)
class MockEventSource {
  static instances: MockEventSource[] = []
  url: string
  readyState = 0
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  close = vi.fn()

  private _listeners: Record<string, EventListener[]> = {}

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this._listeners[type]) this._listeners[type] = []
    this._listeners[type].push(listener)
  }

  removeEventListener(type: string, listener: EventListener) {
    if (!this._listeners[type]) return
    this._listeners[type] = this._listeners[type].filter((l) => l !== listener)
  }

  /** Dispatch a named SSE event (e.g. `event: metrics`) */
  dispatchEvent(event: Event): boolean {
    const listeners = this._listeners[event.type] || []
    for (const listener of listeners) {
      listener(event)
    }
    return listeners.length > 0
  }

  static reset() {
    MockEventSource.instances = []
  }
}

Object.defineProperty(window, 'EventSource', {
  writable: true,
  value: MockEventSource,
})

// Mock navigator.credentials (WebAuthn tests)
Object.defineProperty(navigator, 'credentials', {
  writable: true,
  value: {
    create: vi.fn(),
    get: vi.fn(),
  },
})

// Mock ResizeObserver (needed by Radix Slider and other components)
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock')
URL.revokeObjectURL = vi.fn()

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear()
})
