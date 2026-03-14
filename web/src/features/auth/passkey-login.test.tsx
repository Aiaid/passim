import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { PasskeyLogin } from './passkey-login';
import * as queries from './queries';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => vi.fn(),
}));

vi.mock('./queries', () => ({
  usePasskeyExists: vi.fn(() => ({ data: { exists: true }, isLoading: false })),
}));

describe('PasskeyLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when exists is false', () => {
    vi.mocked(queries.usePasskeyExists).mockReturnValue({
      data: { exists: false },
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeyExists>);
    const { container } = render(<PasskeyLogin />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when isLoading is true', () => {
    vi.mocked(queries.usePasskeyExists).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.usePasskeyExists>);
    const { container } = render(<PasskeyLogin />);
    expect(container.innerHTML).toBe('');
  });

  it('renders button when exists is true', () => {
    vi.mocked(queries.usePasskeyExists).mockReturnValue({
      data: { exists: true },
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeyExists>);
    render(<PasskeyLogin />);
    expect(screen.getByText('auth.sign_in_with_passkey')).toBeInTheDocument();
  });

  it('renders a clickable button element', () => {
    vi.mocked(queries.usePasskeyExists).mockReturnValue({
      data: { exists: true },
      isLoading: false,
    } as ReturnType<typeof queries.usePasskeyExists>);
    render(<PasskeyLogin />);
    const button = screen.getByText('auth.sign_in_with_passkey').closest('button');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
});
