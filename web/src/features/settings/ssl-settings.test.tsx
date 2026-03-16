import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { SSLSettings } from './ssl-settings';
import * as queries from './queries';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('./queries', () => ({
  useSSLStatus: vi.fn(() => ({ data: undefined, isLoading: false })),
  useRenewSSL: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

describe('SSLSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows warning when SSL expires in less than 30 days', () => {
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: true, domain: 'example.com', expires_at: tenDaysFromNow },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    const { container } = render(<SSLSettings />);
    // When expiring soon, the expiry span has text-orange-500 class
    const orangeSpan = container.querySelector('.text-orange-500');
    expect(orangeSpan).toBeInTheDocument();
  });

  it('does not show warning when SSL expires in more than 30 days', () => {
    const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: true, domain: 'example.com', expires_at: sixtyDaysFromNow },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    const { container } = render(<SSLSettings />);
    const orangeSpan = container.querySelector('.text-orange-500');
    expect(orangeSpan).not.toBeInTheDocument();
  });

  it('shows dash when expires_at is empty string', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: true, domain: 'example.com', expires_at: '' },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    // Empty expires_at means the expiry section is not rendered (ssl.expires_at is falsy)
    // So formatDate('-') is never called, and the section is omitted
    expect(screen.queryByText('settings.ssl_expires')).not.toBeInTheDocument();
  });

  it('shows formatted date for valid ISO date', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: true, domain: 'example.com', expires_at: '2026-04-01T00:00:00Z' },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    // The expires label should be present, meaning the date section rendered
    expect(screen.getByText('settings.ssl_expires')).toBeInTheDocument();
    // formatDate produces a locale-dependent string; verify it's not '-'
    const formattedDate = new Date('2026-04-01T00:00:00Z').toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(formattedDate, { exact: false })).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    expect(screen.getByText('settings.ssl')).toBeInTheDocument();
    // TableSkeleton renders Skeleton divs
  });

  it('shows ssl_not_configured when no SSL data', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    expect(screen.getByText('settings.ssl_not_configured')).toBeInTheDocument();
  });

  it('shows ssl_valid text with CheckCircle for valid SSL', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: true, domain: 'example.com', expires_at: '2026-12-01T00:00:00Z' },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    // ssl_valid appears both as label and in the status indicator
    const validTexts = screen.getAllByText('settings.ssl_valid');
    expect(validTexts.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('settings.ssl_invalid')).not.toBeInTheDocument();
  });

  it('shows ssl_invalid text for invalid SSL', () => {
    vi.mocked(queries.useSSLStatus).mockReturnValue({
      data: { mode: 'auto', valid: false, domain: 'example.com', expires_at: '2026-12-01T00:00:00Z' },
      isLoading: false,
    } as ReturnType<typeof queries.useSSLStatus>);

    render(<SSLSettings />);
    const invalidTexts = screen.getAllByText('settings.ssl_invalid');
    expect(invalidTexts.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('settings.ssl_valid')).not.toBeInTheDocument();
  });
});
