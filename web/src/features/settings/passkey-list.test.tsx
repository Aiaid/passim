import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { PasskeyList } from './passkey-list';
import * as queries from './queries';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => {
    if (opts) {
      return Object.entries(opts).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        key,
      );
    }
    return key;
  }, i18n: { language: 'en-US' } }),
}));

vi.mock('./queries', () => ({
  usePasskeys: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDeletePasskey: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const mockPasskeys = [
  { id: '1', name: 'MacBook', created_at: '2026-01-15T10:00:00Z', last_used_at: '2026-03-10T15:30:00Z' },
  { id: '2', name: 'iPhone', created_at: '2026-02-01T08:00:00Z', last_used_at: '0001-01-01T00:00:00Z' },
];

describe('PasskeyList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats zero time as empty string, not as a date', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: [mockPasskeys[1]],
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeys>);

    render(<PasskeyList />);
    // Zero time last_used_at should show 'settings.passkey_never_used' instead of a date
    expect(screen.getByText('settings.passkey_never_used')).toBeInTheDocument();
    // The zero date string should not appear rendered as a date
    expect(screen.queryByText('0001')).not.toBeInTheDocument();
  });

  it('shows EmptyState with passkey_empty text when list is empty', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeys>);

    render(<PasskeyList />);
    expect(screen.getByText('settings.passkey_empty')).toBeInTheDocument();
    expect(screen.getByText('settings.passkey_empty_desc')).toBeInTheDocument();
  });

  it('shows table with passkey names when passkeys exist', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: mockPasskeys,
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeys>);

    render(<PasskeyList />);
    expect(screen.getByText('MacBook')).toBeInTheDocument();
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('settings.passkey_name')).toBeInTheDocument();
  });

  it('shows passkey_never_used for passkey with zero last_used_at', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: mockPasskeys,
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeys>);

    render(<PasskeyList />);
    expect(screen.getByText('settings.passkey_never_used')).toBeInTheDocument();
  });

  it('shows a delete button for each passkey', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: mockPasskeys,
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeys>);

    render(<PasskeyList />);
    const deleteButtons = screen.getAllByRole('button');
    expect(deleteButtons).toHaveLength(mockPasskeys.length);
  });

  it('shows skeleton when loading', () => {
    vi.mocked(queries.usePasskeys).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.usePasskeys>);

    const { container } = render(<PasskeyList />);
    // TableSkeleton renders Skeleton divs with specific height classes
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [class*="h-12"], [class*="h-10"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
