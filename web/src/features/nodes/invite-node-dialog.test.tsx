import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@/test/test-utils';
import { InviteNodeDialog } from './invite-node-dialog';
import * as queries from './queries';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        return Object.entries(opts).reduce(
          (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
          key,
        );
      }
      return key;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./queries', () => ({
  useCreateInvite: vi.fn(),
  useListInvites: vi.fn(),
  useRevokeInvite: vi.fn(),
}));

const mockInvite = {
  token: 'psk_invite_abcdef0123456789abcdef0123456789',
  note: '',
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  created_at: Math.floor(Date.now() / 1000),
  hub_address: 'hub.example.com',
  install_cmd:
    'curl -fsSL https://example.com/install.sh | INVITE=psk_invite_xxx HUB=hub.example.com sudo -E bash',
  docker_cmd:
    'docker run -d --name passim -e INVITE=psk_invite_xxx -e HUB=hub.example.com ghcr.io/aiaid/passim:latest',
};

describe('InviteNodeDialog', () => {
  let createMutate: ReturnType<typeof vi.fn>;
  let revokeMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    createMutate = vi.fn((_data, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.(mockInvite);
    });
    revokeMutate = vi.fn((_token, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });

    vi.mocked(queries.useCreateInvite).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as unknown as ReturnType<typeof queries.useCreateInvite>);

    vi.mocked(queries.useListInvites).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof queries.useListInvites>);

    vi.mocked(queries.useRevokeInvite).mockReturnValue({
      mutate: revokeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof queries.useRevokeInvite>);
  });

  it('mints a fresh invite when dialog opens', async () => {
    render(<InviteNodeDialog open={true} onOpenChange={() => {}} />);
    await waitFor(() => {
      expect(createMutate).toHaveBeenCalled();
    });
  });

  it('renders all three tabs (shell / docker / mobile) and the install/docker command', async () => {
    render(<InviteNodeDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('node.invite.tab.shell')).toBeInTheDocument();
    });
    expect(screen.getByText('node.invite.tab.docker')).toBeInTheDocument();
    expect(screen.getByText('node.invite.tab.mobile')).toBeInTheDocument();

    // Default tab is shell — install_cmd shown.
    expect(screen.getByTestId('invite-cmd-shell')).toHaveTextContent(
      'curl -fsSL',
    );
  });

  it('copies the command to clipboard when copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<InviteNodeDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('invite-cmd-shell')).toBeInTheDocument();
    });

    const copyBtn = screen.getAllByLabelText('node.invite.copy')[0];
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(mockInvite.install_cmd);
    });
  });

  it('revokes the active invite when revoke is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<InviteNodeDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('node.invite.revoke')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('node.invite.revoke'));

    await waitFor(() => {
      expect(revokeMutate).toHaveBeenCalledWith(
        mockInvite.token,
        expect.any(Object),
      );
    });
  });

  it('shows the loading state while the invite is being created', () => {
    vi.mocked(queries.useCreateInvite).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof queries.useCreateInvite>);

    render(<InviteNodeDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('node.invite.creating')).toBeInTheDocument();
  });
});
