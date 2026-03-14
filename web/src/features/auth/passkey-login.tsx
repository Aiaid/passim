import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Fingerprint, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { usePasskeyExists } from './queries';

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PasskeyLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [isPending, setIsPending] = useState(false);
  const { data, isLoading } = usePasskeyExists();

  if (isLoading || !data?.exists) {
    return null;
  }

  async function handlePasskeyLogin() {
    setIsPending(true);
    try {
      const options = await api.passkeyBegin();

      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64urlToBuffer(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        userVerification: (options.userVerification as UserVerificationRequirement) || 'preferred',
        allowCredentials: options.allowCredentials?.map((cred) => ({
          id: base64urlToBuffer(cred.id),
          type: cred.type as PublicKeyCredentialType,
        })),
      };

      const credential = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error('No credential returned');
      }

      const response = credential.response as AuthenticatorAssertionResponse;

      const result = await api.passkeyFinish({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(response.authenticatorData),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          signature: bufferToBase64url(response.signature),
          userHandle: response.userHandle
            ? bufferToBase64url(response.userHandle)
            : undefined,
        },
      });

      login(result.token, result.expires_at);
      navigate('/', { replace: true });
    } catch {
      toast.error(t('auth.passkey_failed'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={isPending}
      onClick={handlePasskeyLogin}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Fingerprint className="size-4" />
      )}
      {t('auth.sign_in_with_passkey')}
    </Button>
  );
}
