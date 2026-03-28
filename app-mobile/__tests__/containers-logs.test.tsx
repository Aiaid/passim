// Shared mocks for all container screen tests

const mockWsSend = jest.fn();
const mockWsClose = jest.fn();

beforeAll(() => {
  // @ts-expect-error - mock WebSocket globally
  global.WebSocket = class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    binaryType = 'arraybuffer';
    send = mockWsSend;
    close = mockWsClose;
    constructor() {
      setTimeout(() => this.onopen?.(), 0);
    }
  };
});

// Mock expo-router
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'abc123', name: 'test-container' }),
  router: { back: mockBack, push: mockPush },
}));

// Mock stores
jest.mock('@/stores/node-store', () => ({
  useNodeStore: (selector: (s: { activeNodeId: string; nodes: Array<{ id: string; host: string; token: string }> }) => unknown) =>
    selector({
      activeNodeId: 'node-1',
      nodes: [{ id: 'node-1', host: 'localhost:8443', token: 'test-token' }],
    }),
}));

// Mock i18n
jest.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en-US',
  }),
}));

// Mock hooks
const mockRefetch = jest.fn();
jest.mock('@/hooks/use-containers', () => ({
  useContainerLogs: (_nodeId: string, _id: string) => ({
    data: { logs: 'line 1\nline 2\nline 3\n' },
    isLoading: false,
    refetch: mockRefetch,
    isRefetching: false,
  }),
}));

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ContainerLogsScreen from '../app/containers/[id]/logs';
import ContainerTerminalScreen from '../app/containers/[id]/terminal';

describe('ContainerLogsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the logs screen with header', () => {
    render(<ContainerLogsScreen />);
    expect(screen.getByText('container.logs')).toBeTruthy();
  });

  it('renders container name in the terminal chrome bar', () => {
    render(<ContainerLogsScreen />);
    expect(screen.getByText('test-container')).toBeTruthy();
  });

  it('renders log lines', () => {
    render(<ContainerLogsScreen />);
    expect(screen.getByText('line 1')).toBeTruthy();
    expect(screen.getByText('line 2')).toBeTruthy();
    expect(screen.getByText('line 3')).toBeTruthy();
  });

  it('renders auto-scroll toggle', () => {
    render(<ContainerLogsScreen />);
    expect(screen.getByText('container.auto_scroll')).toBeTruthy();
  });
});

describe('ContainerTerminalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the terminal screen with header', () => {
    render(<ContainerTerminalScreen />);
    expect(screen.getByText('container.terminal')).toBeTruthy();
  });

  it('renders container name in chrome bar', () => {
    render(<ContainerTerminalScreen />);
    expect(screen.getByText('test-container')).toBeTruthy();
  });

  it('shows connection status', () => {
    render(<ContainerTerminalScreen />);
    expect(screen.getByText('container.terminal_connecting')).toBeTruthy();
  });
});
