import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { ContainerSummary } from './container-summary';
import * as queries from './queries';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('./queries', () => ({
  useContainersSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

const mockContainers = [
  { Id: '1', Names: ['/nginx'], Image: 'nginx:latest', State: 'running', Status: 'Up 2 hours', Created: 0 },
  { Id: '2', Names: ['/redis'], Image: 'redis:7', State: 'exited', Status: 'Exited', Created: 0 },
];

describe('ContainerSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips leading / from container names', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: [mockContainers[0]],
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.queryByText('/nginx')).not.toBeInTheDocument();
  });

  it('shows skeleton elements when loading', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.useContainersSummary>);
    const { container } = render(<ContainerSummary />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBe(3);
  });

  it('shows no_data text when containers array is empty', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    expect(screen.getByText('common.no_data')).toBeInTheDocument();
  });

  it('shows max 5 containers when given more', () => {
    const sevenContainers = Array.from({ length: 7 }, (_, i) => ({
      Id: String(i),
      Names: [`/container-${i}`],
      Image: 'img:latest',
      State: 'running',
      Status: 'Up',
      Created: 0,
    }));
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: sevenContainers,
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`container-${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('container-5')).not.toBeInTheDocument();
    expect(screen.queryByText('container-6')).not.toBeInTheDocument();
  });

  it('displays running count correctly', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: mockContainers,
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    // 1 running out of 2 total — t returns the key with interpolated values
    expect(screen.getByText('dashboard.running_of_total')).toBeInTheDocument();
  });

  it('renders navigate button with view_all text', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: mockContainers,
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    expect(screen.getByText('dashboard.view_all')).toBeInTheDocument();
  });

  it('shows no_data when data is undefined', () => {
    vi.mocked(queries.useContainersSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof queries.useContainersSummary>);
    render(<ContainerSummary />);
    expect(screen.getByText('common.no_data')).toBeInTheDocument();
  });
});
