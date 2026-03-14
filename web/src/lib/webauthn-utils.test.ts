import { describe, it, expect } from 'vitest';
import { base64urlToBuffer, bufferToBase64url } from './webauthn-utils';

describe('webauthn-utils', () => {
  it('round-trips encode then decode to same bytes', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = bufferToBase64url(original.buffer);
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(decoded).toEqual(original);
  });

  it('handles characters that differ between base64 and base64url', () => {
    // Byte sequence that produces + and / in standard base64: [62] -> '+', [63] -> '/'
    // 0x3E = 62, 0xBF = 191 → standard base64 would contain + and /
    const bytes = new Uint8Array([0x3E, 0xBF, 0xFF, 0x3E, 0xBF]);
    const encoded = bufferToBase64url(bytes.buffer);
    // base64url should NOT contain +, /, or =
    expect(encoded).not.toMatch(/[+/=]/);
    // Round-trip should still work
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(decoded).toEqual(bytes);
  });
});
