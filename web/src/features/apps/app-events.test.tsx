import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@/test/test-utils';
import { AppEvents } from './app-events';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

let capturedOnMessage: ((data: unknown) => void) | undefined;
let mockIsConnected = false;

vi.mock('@/hooks/use-sse', () => ({
  useSSE: vi.fn((_path: string, options?: { onMessage?: (data: unknown) => void }) => {
    capturedOnMessage = options?.onMessage;
    return { data: null, isConnected: mockIsConnected };
  }),
}));

describe('AppEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMessage = undefined;
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

    expect(capturedOnMessage).toBeDefined();

    act(() => {
      capturedOnMessage!({ type: 'deploy', data: 'First event', timestamp: '2026-03-14T10:00:00Z' });
    });

    act(() => {
      capturedOnMessage!({ type: 'health', data: 'Second event', timestamp: '2026-03-14T10:01:00Z' });
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
