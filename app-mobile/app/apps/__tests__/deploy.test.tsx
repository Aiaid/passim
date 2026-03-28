import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DeployScreen from '../deploy';

// ---- Mocks ----

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
  };
});

const mockTemplates = [
  {
    name: 'wireguard',
    category: 'vpn',
    icon: '',
    description: { 'en-US': 'WireGuard VPN' },
    settings: [],
  },
  {
    name: 'openvpn',
    category: 'vpn',
    icon: '',
    description: { 'en-US': 'OpenVPN Server' },
    settings: [],
  },
  {
    name: 'nextcloud',
    category: 'storage',
    icon: '',
    description: { 'en-US': 'Cloud storage' },
    settings: [],
  },
  {
    name: 'nginx-proxy',
    category: 'proxy',
    icon: '',
    description: { 'en-US': 'Reverse proxy' },
    settings: [],
  },
  {
    name: 'rustdesk',
    category: 'remote',
    icon: '',
    description: { 'en-US': 'Remote desktop' },
    settings: [],
  },
  {
    name: 'speedtest',
    category: 'tools',
    icon: '',
    description: { 'en-US': 'Speed test server' },
    settings: [],
  },
];

jest.mock('@/hooks/use-apps', () => ({
  useTemplates: () => ({ data: mockTemplates, isLoading: false }),
  useTemplate: () => ({ data: null, isLoading: false }),
  useDeployApp: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock('@/stores/node-store', () => ({
  useNodeStore: (selector: (s: { activeNodeId: string }) => string) =>
    selector({ activeNodeId: 'node-1' }),
}));

jest.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'mobile.choose_template': 'Choose Template',
        'mobile.configure': 'Configure',
        'mobile.next': 'Next',
        'mobile.deploy': 'Deploy',
        'mobile.deploying': 'Deploying...',
        'mobile.no_templates': 'No templates available',
        'marketplace.search': 'Search templates...',
        'marketplace.all': 'All',
        'marketplace.vpn': 'VPN',
        'marketplace.storage': 'Storage',
        'marketplace.proxy': 'Proxy',
        'marketplace.remote': 'Remote Desktop',
        'marketplace.tools': 'Tools',
        'marketplace.no_match': 'No templates match your search',
        'marketplace.deploy_failed': 'Deployment failed',
        'mobile.deploy_failed_msg': 'Could not deploy the app.',
      };
      return map[key] ?? key;
    },
    language: 'en-US',
  }),
}));

// ---- Tests ----

describe('DeployScreen', () => {
  it('renders all templates by default', () => {
    const { getByTestId, getAllByTestId } = render(<DeployScreen />);
    // Search input should be visible
    expect(getByTestId('search-input')).toBeTruthy();
    // All category pills should be visible
    expect(getByTestId('category-all')).toBeTruthy();
    expect(getByTestId('category-vpn')).toBeTruthy();
    expect(getByTestId('category-storage')).toBeTruthy();
    expect(getByTestId('category-proxy')).toBeTruthy();
    expect(getByTestId('category-remote')).toBeTruthy();
    expect(getByTestId('category-tools')).toBeTruthy();
    // All 6 templates should be rendered
    expect(getByTestId('template-wireguard')).toBeTruthy();
    expect(getByTestId('template-openvpn')).toBeTruthy();
    expect(getByTestId('template-nextcloud')).toBeTruthy();
    expect(getByTestId('template-nginx-proxy')).toBeTruthy();
    expect(getByTestId('template-rustdesk')).toBeTruthy();
    expect(getByTestId('template-speedtest')).toBeTruthy();
  });

  it('filters templates by category when a pill is pressed', () => {
    const { getByTestId, queryByTestId } = render(<DeployScreen />);

    fireEvent.press(getByTestId('category-vpn'));

    // VPN templates should be visible
    expect(getByTestId('template-wireguard')).toBeTruthy();
    expect(getByTestId('template-openvpn')).toBeTruthy();
    // Non-VPN templates should be gone
    expect(queryByTestId('template-nextcloud')).toBeNull();
    expect(queryByTestId('template-nginx-proxy')).toBeNull();
    expect(queryByTestId('template-rustdesk')).toBeNull();
    expect(queryByTestId('template-speedtest')).toBeNull();
  });

  it('filters templates by search text', () => {
    const { getByTestId, queryByTestId } = render(<DeployScreen />);

    fireEvent.changeText(getByTestId('search-input'), 'wire');

    // Only wireguard should match
    expect(getByTestId('template-wireguard')).toBeTruthy();
    expect(queryByTestId('template-openvpn')).toBeNull();
    expect(queryByTestId('template-nextcloud')).toBeNull();
  });

  it('combines category and search filters', () => {
    const { getByTestId, queryByTestId } = render(<DeployScreen />);

    // Select VPN category
    fireEvent.press(getByTestId('category-vpn'));
    // Then type "open"
    fireEvent.changeText(getByTestId('search-input'), 'open');

    // Only openvpn matches both VPN category + "open" search
    expect(getByTestId('template-openvpn')).toBeTruthy();
    expect(queryByTestId('template-wireguard')).toBeNull();
  });

  it('shows no-match message when filters produce zero results', () => {
    const { getByTestId, getByText } = render(<DeployScreen />);

    fireEvent.changeText(getByTestId('search-input'), 'nonexistent');

    expect(getByText('No templates match your search')).toBeTruthy();
  });

  it('returns to all templates when "All" pill is pressed after filtering', () => {
    const { getByTestId } = render(<DeployScreen />);

    // Filter to VPN
    fireEvent.press(getByTestId('category-vpn'));
    expect(getByTestId('template-wireguard')).toBeTruthy();

    // Go back to All
    fireEvent.press(getByTestId('category-all'));
    // All templates should be visible again
    expect(getByTestId('template-wireguard')).toBeTruthy();
    expect(getByTestId('template-nextcloud')).toBeTruthy();
    expect(getByTestId('template-speedtest')).toBeTruthy();
  });

  it('search is case-insensitive', () => {
    const { getByTestId } = render(<DeployScreen />);

    fireEvent.changeText(getByTestId('search-input'), 'NEXT');

    expect(getByTestId('template-nextcloud')).toBeTruthy();
  });
});
