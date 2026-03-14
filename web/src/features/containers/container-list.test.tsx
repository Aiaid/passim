import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import type { Container } from '@/lib/api-client';
import { ContainerList } from './container-list';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('./container-actions', () => ({
  ContainerActions: () => <div data-testid="container-actions" />,
}));

vi.mock('./container-logs', () => ({
  ContainerLogs: () => null,
}));

const containers: Container[] = [
  { Id: 'abc123def456', Names: ['/nginx'], Image: 'nginx:latest', State: 'running', Status: 'Up 2h', Created: 0 },
  { Id: 'xyz789000000', Names: ['/redis'], Image: 'redis:7-alpine', State: 'exited', Status: 'Exited (0)', Created: 0 },
];

describe('ContainerList', () => {
  it('maps exited state to stopped in the status badge', () => {
    render(<ContainerList containers={[containers[1]]} />);
    expect(screen.getByText('stopped')).toBeInTheDocument();
    expect(screen.queryByText('exited')).not.toBeInTheDocument();
  });

  it('keeps running state as running', () => {
    render(<ContainerList containers={[containers[0]]} />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('strips leading / from container name', () => {
    render(<ContainerList containers={[containers[0]]} />);
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.queryByText('/nginx')).not.toBeInTheDocument();
  });

  it('truncates image names longer than 40 chars', () => {
    const longImage = 'registry.example.com/org/very-long-image-name:latest-version-tag';
    const container: Container = {
      Id: 'long123',
      Names: ['/longimg'],
      Image: longImage,
      State: 'running',
      Status: 'Up 1h',
      Created: 0,
    };
    render(<ContainerList containers={[container]} />);
    const truncated = longImage.slice(0, 40) + '...';
    expect(screen.getByText(truncated)).toBeInTheDocument();
    expect(screen.queryByText(longImage)).not.toBeInTheDocument();
  });

  it('does not truncate image names 40 chars or shorter', () => {
    render(<ContainerList containers={[containers[0]]} />);
    expect(screen.getByText('nginx:latest')).toBeInTheDocument();
  });

  it('renders correct number of rows for given containers', () => {
    const threeContainers: Container[] = [
      ...containers,
      { Id: 'third111', Names: ['/postgres'], Image: 'postgres:16', State: 'running', Status: 'Up 5m', Created: 0 },
    ];
    render(<ContainerList containers={threeContainers} />);
    const tbody = screen.getByRole('table').querySelector('tbody');
    const rows = within(tbody!).getAllByRole('row');
    expect(rows).toHaveLength(3);
  });

  it('falls back to first 12 chars of Id when Names is empty', () => {
    const noName: Container = {
      Id: 'abcdef123456789extra',
      Names: [],
      Image: 'alpine:3',
      State: 'running',
      Status: 'Up 10m',
      Created: 0,
    };
    render(<ContainerList containers={[noName]} />);
    expect(screen.getByText('abcdef123456')).toBeInTheDocument();
  });
});
