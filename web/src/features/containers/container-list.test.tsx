import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { Container } from '@/lib/api-client';
import { ContainerList } from './container-list';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('./container-actions', () => ({
  ContainerActions: () => <div data-testid="container-actions" />,
}));

vi.mock('./container-detail-panel', () => ({
  ContainerDetailPanel: () => null,
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

  it('shows full image name (CSS handles truncation)', () => {
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
    expect(screen.getByText(longImage)).toBeInTheDocument();
  });

  it('renders a card for each container', () => {
    const threeContainers: Container[] = [
      ...containers,
      { Id: 'third111', Names: ['/postgres'], Image: 'postgres:16', State: 'running', Status: 'Up 5m', Created: 0 },
    ];
    render(<ContainerList containers={threeContainers} />);
    expect(screen.getAllByTestId('container-actions')).toHaveLength(3);
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
