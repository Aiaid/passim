import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { Container } from '@/lib/api-client';
import { ContainerActions } from './container-actions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('./queries', () => ({
  useContainerAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveContainer: () => ({ mutate: vi.fn(), isPending: false }),
}));

const runningContainer: Container = {
  Id: 'run123',
  Names: ['/myapp'],
  Image: 'myapp:latest',
  State: 'running',
  Status: 'Up 1h',
  Created: 0,
};

const stoppedContainer: Container = {
  Id: 'stop456',
  Names: ['/mydb'],
  Image: 'postgres:16',
  State: 'exited',
  Status: 'Exited (0)',
  Created: 0,
};

describe('ContainerActions', () => {
  it('shows Stop and Restart for a running container, not Start or Remove', async () => {
    const user = userEvent.setup();
    render(<ContainerActions container={runningContainer} />);
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('container.stop')).toBeInTheDocument();
    expect(screen.getByText('container.restart')).toBeInTheDocument();
    expect(screen.queryByText('container.start')).not.toBeInTheDocument();
    expect(screen.queryByText('container.remove')).not.toBeInTheDocument();
  });

  it('shows Start and Remove for a stopped container, not Stop or Restart', async () => {
    const user = userEvent.setup();
    render(<ContainerActions container={stoppedContainer} />);
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('container.start')).toBeInTheDocument();
    expect(screen.getByText('container.remove')).toBeInTheDocument();
    expect(screen.queryByText('container.stop')).not.toBeInTheDocument();
    expect(screen.queryByText('container.restart')).not.toBeInTheDocument();
  });
});
