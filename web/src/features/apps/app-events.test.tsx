import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@/test/test-utils';
import { AppEvents } from './app-events';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

let mockIsConnected = false;
let capturedResourceHandler: ((data: unknown) => void) | undefined;

vi.mock('@/hooks/use-event-stream', () => ({
  useEventStream: vi.fn(() => ({
    metrics: null,
    metricsHistory: [],
    status: null,
    containers: null,
    apps: null,
    isConnected: mockIsConnected,
  })),
  useResourceEvents: vi.fn((_topic: string, handler: (data: unknown) => void) => {
    capturedResourceHandler = handler;
  }),
}));

describe('AppEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedResourceHandler = undefined;
    mockIsConnected = false;
  });

  it('shows disconnected state text', () => {
    mockIsConnected = false;
    render(<AppEvents appId="app-1" />);
    expect(screen.getByText('app.events_disconnected')).toBeInTheDocument();
    expect(screen.queryByText('app.events_connected')).not.toBeInTheDocument();
  });

  it('shows connected state text', () => {
    mockIsConnected = true;
    render(<AppEvents appId="app-1" />);
    expect(screen.getByText('app.events_connected')).toBeInTheDocument();
    expect(screen.queryByText('app.events_disconnected')).not.toBeInTheDocument();
  });

  it('shows EmptyState with no_events when no events received', () => {
    render(<AppEvents appId="app-1" />);
    expect(screen.getByText('app.no_events')).toBeInTheDocument();
  });

  it('accumulates events in reverse order (newest first)', () => {
    render(<AppEvents appId="app-1" />);

    expect(capturedResourceHandler).toBeDefined();

    act(() => {
      capturedResourceHandler!({ type: 'deploy', data: 'First event' });
    });

    act(() => {
      capturedResourceHandler!({ type: 'health', data: 'Second event' });
    });

    // Both events should be visible
    expect(screen.getByText('First event')).toBeInTheDocument();
    expect(screen.getByText('Second event')).toBeInTheDocument();

    // EmptyState should be gone
    expect(screen.queryByText('app.no_events')).not.toBeInTheDocument();

    // Verify order: "Second event" card should appear before "First event" card in the DOM
    const cards = screen.getAllByText(/event/i).filter(
      (el) => el.textContent === 'First event' || el.textContent === 'Second event',
    );
    expect(cards[0].textContent).toBe('Second event');
    expect(cards[1].textContent).toBe('First event');
  });
});
