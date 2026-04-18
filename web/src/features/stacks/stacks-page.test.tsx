import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { Stack } from '@/lib/api-client';
import { StacksPage } from './stacks-page';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockUseStacks = vi.fn();

vi.mock('./queries', () => ({
  useStacks: () => mockUseStacks(),
  useStack: () => ({ data: null }),
  useCreateStack: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn(), data: null, error: null }),
  useValidateStack: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn(), data: null, error: null }),
  useDeleteStack: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('./stack-create-dialog', () => ({
  StackCreateDialog: () => null,
}));

vi.mock('./stack-detail-panel', () => ({
  StackDetailPanel: () => null,
}));

const runningStack: Stack = {
  id: 'a', name: 'immich', yaml_text: '', env_text: '', profiles: [],
  status: 'running', created_at: '', updated_at: '',
};
const errorStack: Stack = {
  id: 'b', name: 'broken', yaml_text: '', env_text: '', profiles: [],
  status: 'error', last_error: 'image pull failed', created_at: '', updated_at: '',
};

describe('StacksPage', () => {
  beforeEach(() => {
    mockUseStacks.mockReset();
  });

  it('shows empty state when no stacks', () => {
    mockUseStacks.mockReturnValue({ data: { stacks: [] }, isLoading: false });
    render(<StacksPage />);
    expect(screen.getByText('stacks.empty_title')).toBeInTheDocument();
  });

  it('renders stack cards with their names', () => {
    mockUseStacks.mockReturnValue({ data: { stacks: [runningStack, errorStack] }, isLoading: false });
    render(<StacksPage />);
    expect(screen.getByText('immich')).toBeInTheDocument();
    expect(screen.getByText('broken')).toBeInTheDocument();
  });

  it('surfaces last_error text on error stacks', () => {
    mockUseStacks.mockReturnValue({ data: { stacks: [errorStack] }, isLoading: false });
    render(<StacksPage />);
    expect(screen.getByText('image pull failed')).toBeInTheDocument();
  });

  it('maps stack status to StatusBadge vocabulary', () => {
    mockUseStacks.mockReturnValue({ data: { stacks: [runningStack, errorStack] }, isLoading: false });
    render(<StacksPage />);
    // running → running, error → failed
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
