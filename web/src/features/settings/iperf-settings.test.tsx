import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { IperfSettings } from './iperf-settings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    getIperfStatus: vi.fn(() => Promise.resolve({ status: 'stopped' })),
    startIperf: vi.fn(() => Promise.resolve({ status: 'ready' })),
    stopIperf: vi.fn(() => Promise.resolve({ status: 'stopped' })),
  },
}));

describe('IperfSettings', () => {
  it('renders the iperf toggle card', () => {
    render(<IperfSettings />);
    expect(screen.getByText('settings.iperf_title')).toBeInTheDocument();
    expect(screen.getByText('settings.iperf_server')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('switch defaults to unchecked when status is stopped', () => {
    render(<IperfSettings />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
  });
});
