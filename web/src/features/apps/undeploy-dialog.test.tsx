import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { UndeployDialog } from './undeploy-dialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockMutate = vi.fn();
vi.mock('./queries', () => ({
  useDeleteApp: () => ({ mutate: mockMutate, isPending: false }),
}));

describe('UndeployDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteApp.mutate with appId when confirm button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <UndeployDialog appId="my-app-123" open={true} onOpenChange={vi.fn()} />,
    );

    const confirmButton = screen.getByRole('button', { name: 'app.undeploy' });
    await user.click(confirmButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith('my-app-123');
  });

  it('renders confirm button with destructive styling', () => {
    render(
      <UndeployDialog appId="my-app-123" open={true} onOpenChange={vi.fn()} />,
    );

    const confirmButton = screen.getByRole('button', { name: 'app.undeploy' });
    expect(confirmButton.className).toMatch(/destructive/);
  });
});
