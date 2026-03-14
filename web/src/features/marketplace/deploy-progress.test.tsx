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
  // -- statusToProgress (tested via Progress indicator transform) -------------

  it('sets progress to 15% for pending status', () => {
    renderProgress('pending');
    const indicator = document.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    // 100 - 15 = 85 → translateX(-85%)
    expect(indicator.style.transform).toBe('translateX(-85%)');
  });

  it('sets progress to 60% for running status', () => {
    renderProgress('running');
    const indicator = document.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    // 100 - 60 = 40 → translateX(-40%)
    expect(indicator.style.transform).toBe('translateX(-40%)');
  });

  it('sets progress to 100% for done status', () => {
    renderProgress('done');
    const indicator = document.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    // 100 - 100 = 0 → translateX(-0%)
    expect(indicator.style.transform).toBe('translateX(-0%)');
  });

  it('sets progress to 100% for failed status', () => {
    renderProgress('failed');
    const indicator = document.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.transform).toBe('translateX(-0%)');
  });

  // -- Conditional rendering -------------------------------------------------

  it('shows view_app button when done', () => {
    renderProgress('done');
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

  it('shows spinner for pending status', () => {
    renderProgress('pending');
    // Loader2 has the animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows deploying text for running status', () => {
    renderProgress('running');
    expect(screen.getByText('marketplace.deploying')).toBeInTheDocument();
  });
});
