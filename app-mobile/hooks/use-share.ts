import { useQuery } from '@tanstack/react-query';
import type { ShareConfigResponse } from '@passim/shared/types';
import { qk } from '@/lib/query-keys';

/**
 * Fetch a public share config by token.
 * This requires a host to fetch from — we resolve it from the share URL's origin.
 * Since share links are public (no auth), we make a direct fetch.
 */
export function useShareConfig(host: string, token: string) {
  return useQuery<ShareConfigResponse>({
    queryKey: qk.shareConfig(host, token),
    queryFn: async () => {
      const res = await fetch(`https://${host}/api/s/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !!host && !!token,
    retry: false,
  });
}

/**
 * Build the download URL for a share file.
 */
export function getShareFileURL(host: string, token: string, index: number): string {
  return `https://${host}/api/s/${token}/file/${index}`;
}

/**
 * Build the download URL for a remote share file.
 */
export function getShareRemoteFileURL(
  host: string,
  token: string,
  index: number,
  nodeId: string,
  appId: string,
): string {
  return `https://${host}/api/s/${token}/file/${index}?node=${nodeId}&app=${appId}`;
}

/**
 * Build the ZIP download URL for a share.
 */
export function getShareZIPURL(host: string, token: string): string {
  return `https://${host}/api/s/${token}/zip`;
}

/**
 * Build the subscription URL for a share.
 */
export function getShareSubscribeURL(host: string, token: string): string {
  return `https://${host}/api/s/${token}/subscribe`;
}

/**
 * Fetch file content as text (for QR display).
 */
export async function fetchShareFileContent(
  host: string,
  token: string,
  index: number,
): Promise<string> {
  const res = await fetch(getShareFileURL(host, token, index));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetch remote file content as text (for QR display).
 */
export async function fetchShareRemoteFileContent(
  host: string,
  token: string,
  index: number,
  nodeId: string,
  appId: string,
): Promise<string> {
  const res = await fetch(getShareRemoteFileURL(host, token, index, nodeId, appId));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
