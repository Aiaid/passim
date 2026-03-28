import {
  getShareFileURL,
  getShareRemoteFileURL,
  getShareZIPURL,
  getShareSubscribeURL,
} from '../hooks/use-share';

describe('share URL builders', () => {
  const host = 'example.com:8443';
  const token = 'abc-123-def';

  test('getShareFileURL builds correct URL', () => {
    expect(getShareFileURL(host, token, 1)).toBe(
      'https://example.com:8443/api/s/abc-123-def/file/1',
    );
    expect(getShareFileURL(host, token, 5)).toBe(
      'https://example.com:8443/api/s/abc-123-def/file/5',
    );
  });

  test('getShareRemoteFileURL builds correct URL with node and app params', () => {
    const url = getShareRemoteFileURL(host, token, 2, 'node-1', 'app-1');
    expect(url).toBe(
      'https://example.com:8443/api/s/abc-123-def/file/2?node=node-1&app=app-1',
    );
  });

  test('getShareZIPURL builds correct URL', () => {
    expect(getShareZIPURL(host, token)).toBe(
      'https://example.com:8443/api/s/abc-123-def/zip',
    );
  });

  test('getShareSubscribeURL builds correct URL', () => {
    expect(getShareSubscribeURL(host, token)).toBe(
      'https://example.com:8443/api/s/abc-123-def/subscribe',
    );
  });
});
