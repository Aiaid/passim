import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { MarketplacePage } from './marketplace-page';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('./queries', () => ({
  useTemplates: vi.fn(() => ({
    data: [
      { name: 'WireGuard', category: 'vpn', icon: '🔒', description: { 'en-US': 'VPN' }, settings: [] },
      { name: 'Nextcloud', category: 'storage', icon: '☁️', description: { 'en-US': 'Cloud' }, settings: [] },
      { name: 'V2Ray', category: 'vpn', icon: '🌐', description: { 'en-US': 'Proxy' }, settings: [] },
    ],
    isLoading: false,
  })),
}));

vi.mock('./template-grid', () => ({
  TemplateGrid: ({ templates }: { templates: { name: string }[] }) => (
    <div data-testid="template-grid">
      {templates.map((t) => (
        <div key={t.name} data-testid="template">
          {t.name}
        </div>
      ))}
    </div>
  ),
}));

// -- Tests -------------------------------------------------------------------

describe('MarketplacePage', () => {
  it('shows all templates by default with "all" category', () => {
    render(<MarketplacePage />);
    const items = screen.getAllByTestId('template');
    expect(items).toHaveLength(3);
    expect(screen.getByText('WireGuard')).toBeInTheDocument();
    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    expect(screen.getByText('V2Ray')).toBeInTheDocument();
  });

  it('filters by category when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<MarketplacePage />);

    await user.click(screen.getByRole('tab', { name: 'marketplace.vpn' }));

    const items = screen.getAllByTestId('template');
    expect(items).toHaveLength(2);
    expect(screen.getByText('WireGuard')).toBeInTheDocument();
    expect(screen.getByText('V2Ray')).toBeInTheDocument();
    expect(screen.queryByText('Nextcloud')).not.toBeInTheDocument();
  });

  it('filters by search text (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<MarketplacePage />);

    const searchInput = screen.getByPlaceholderText('marketplace.search');
    await user.type(searchInput, 'wire');

    const items = screen.getAllByTestId('template');
    expect(items).toHaveLength(1);
    expect(screen.getByText('WireGuard')).toBeInTheDocument();
  });

  it('combines category filter with search', async () => {
    const user = userEvent.setup();
    render(<MarketplacePage />);

    await user.click(screen.getByRole('tab', { name: 'marketplace.vpn' }));

    const searchInput = screen.getByPlaceholderText('marketplace.search');
    await user.type(searchInput, 'v2');

    const items = screen.getAllByTestId('template');
    expect(items).toHaveLength(1);
    expect(screen.getByText('V2Ray')).toBeInTheDocument();
    expect(screen.queryByText('WireGuard')).not.toBeInTheDocument();
  });
});
