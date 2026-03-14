import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockLoginAsync = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    loginAsync: mockLoginAsync,
    isLoggingIn: false,
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    loginError: null,
  }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders password input and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByPlaceholderText('auth.api_key_placeholder')).toBeInTheDocument();
    expect(screen.getByText('auth.sign_in')).toBeInTheDocument();
  });

  it('empty submit does not call loginAsync', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByText('auth.sign_in'));
    await waitFor(() => {
      expect(mockLoginAsync).not.toHaveBeenCalled();
    });
  });

  it('submits with value and calls loginAsync', async () => {
    const user = userEvent.setup();
    mockLoginAsync.mockResolvedValue({ token: 'tok', expires_at: '' });
    render(<LoginForm />);
    await user.type(screen.getByPlaceholderText('auth.api_key_placeholder'), 'my-secret-key');
    await user.click(screen.getByText('auth.sign_in'));
    await waitFor(() => {
      expect(mockLoginAsync).toHaveBeenCalledWith('my-secret-key');
    });
  });

  it('navigates to / on success', async () => {
    const user = userEvent.setup();
    mockLoginAsync.mockResolvedValue({ token: 'tok', expires_at: '' });
    render(<LoginForm />);
    await user.type(screen.getByPlaceholderText('auth.api_key_placeholder'), 'valid-key');
    await user.click(screen.getByText('auth.sign_in'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('does not navigate on failure', async () => {
    const user = userEvent.setup();
    mockLoginAsync.mockRejectedValue(new Error('invalid'));
    render(<LoginForm />);
    await user.type(screen.getByPlaceholderText('auth.api_key_placeholder'), 'bad-key');
    await user.click(screen.getByText('auth.sign_in'));
    await waitFor(() => {
      expect(mockLoginAsync).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables button when isLoggingIn is true', async () => {
    const useAuthModule = await import('@/hooks/use-auth');
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      loginAsync: mockLoginAsync,
      isLoggingIn: true,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      loginError: null,
    });
    render(<LoginForm />);
    expect(screen.getByText('auth.sign_in').closest('button')).toBeDisabled();
  });
});
