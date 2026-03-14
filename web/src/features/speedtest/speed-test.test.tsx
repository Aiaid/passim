import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { SpeedTest } from './speed-test';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('SpeedTest', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('renders the speed test card with start button', () => {
    render(<SpeedTest />);
    expect(screen.getByText('speedtest.title')).toBeInTheDocument();
    expect(screen.getByText('speedtest.desc')).toBeInTheDocument();
    expect(screen.getByText('speedtest.start')).toBeInTheDocument();
  });

  it('renders all four metric labels', () => {
    render(<SpeedTest />);
    expect(screen.getByText('speedtest.download')).toBeInTheDocument();
    expect(screen.getByText('speedtest.upload')).toBeInTheDocument();
    expect(screen.getByText('speedtest.latency')).toBeInTheDocument();
    expect(screen.getByText('speedtest.jitter')).toBeInTheDocument();
  });

  it('shows placeholder values when no result exists', () => {
    render(<SpeedTest />);
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBe(4);
  });

  it('displays last result from localStorage', () => {
    localStorageMock.setItem(
      'speedtest-last',
      JSON.stringify({
        download: 856.12,
        upload: 421.5,
        latency: 3.2,
        jitter: 0.8,
        timestamp: '2026-03-12T10:30:00.000Z',
      })
    );
    render(<SpeedTest />);
    expect(screen.getByText('856')).toBeInTheDocument();
    expect(screen.getByText('422')).toBeInTheDocument();
    expect(screen.getByText('3.2')).toBeInTheDocument();
    expect(screen.getByText('0.8')).toBeInTheDocument();
  });

  it('start button is clickable', () => {
    render(<SpeedTest />);
    const button = screen.getByText('speedtest.start');
    expect(button).not.toBeDisabled();
    // We don't actually run the test since fetch is not mocked
  });
});
