import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { DeployProgress } from './deploy-progress';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseTaskStatus = vi.fn<() => { data: unknown }>(() => ({ data: undefined }));
vi.mock('./queries', () => ({
  useTaskStatus: (...args: unknown[]) => mockUseTaskStatus(...(args as [])),
}));

// -- Helpers -----------------------------------------------------------------

function renderProgress(
  status: string | undefined,
  opts: { result?: string; onRetry?: () => void } = {},
) {
  const taskData = status
    ? { status, result: opts.result ?? '' }
    : undefined;
  mockUseTaskStatus.mockReturnValue({ data: taskData });

  return render(
    <DeployProgress
      appId="app-1"
      taskId="task-1"
      onRetry={opts.onRetry ?? vi.fn()}
    />,
  );
}

// -- Tests -------------------------------------------------------------------

describe('DeployProgress', () => {
  it('shows spinner for pending/queued status', () => {
    renderProgress('queued');
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows step labels', () => {
    renderProgress('queued');
    expect(screen.getByText('marketplace.step_pending')).toBeInTheDocument();
    expect(screen.getByText('marketplace.step_pulling')).toBeInTheDocument();
    expect(screen.getByText('marketplace.step_deploying')).toBeInTheDocument();
    expect(screen.getByText('marketplace.step_running')).toBeInTheDocument();
  });

  it('shows view_app button when completed', () => {
    renderProgress('completed');
    expect(
      screen.getByRole('button', { name: 'marketplace.view_app' }),
    ).toBeInTheDocument();
  });

  it('shows retry button when failed', () => {
    renderProgress('failed');
    expect(
      screen.getByRole('button', { name: 'marketplace.retry' }),
    ).toBeInTheDocument();
  });

  it('shows deploy_failed text when failed', () => {
    renderProgress('failed');
    expect(screen.getByText('marketplace.deploy_failed')).toBeInTheDocument();
  });

  it('shows deploy_success text when completed', () => {
    renderProgress('completed');
    expect(screen.getByText('marketplace.deploy_success')).toBeInTheDocument();
  });

  it('shows error result when failed with result', () => {
    renderProgress('failed', { result: 'image pull timeout' });
    expect(screen.getByText('image pull timeout')).toBeInTheDocument();
  });

  it('shows step_failed label when failed', () => {
    renderProgress('failed');
    expect(screen.getByText('marketplace.step_failed')).toBeInTheDocument();
  });
});
