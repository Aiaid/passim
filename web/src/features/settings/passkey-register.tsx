import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api-client';
import { base64urlToBuffer, bufferToBase64url } from '@/lib/webauthn-utils';
import { useRegisterPasskey } from './queries';

export function PasskeyRegister() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isPending, setIsPending] = useState(false);
  const registerPasskey = useRegisterPasskey();

  async function handleRegister() {
    setIsPending(true);
    try {
      const options = await api.passkeyRegister();

      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        rp: options.rp,
        user: {
          id: base64urlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        challenge: base64urlToBuffer(options.challenge),
        pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
          type: p.type as PublicKeyCredentialType,
          alg: p.alg,
        })),
        timeout: options.timeout,
        excludeCredentials: options.excludeCredentials?.map((cred) => ({
          id: base64urlToBuffer(cred.id),
          type: cred.type as PublicKeyCredentialType,
        })),
        authenticatorSelection: options.authenticatorSelection
          ? {
              authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment | undefined,
              requireResidentKey: options.authenticatorSelection.requireResidentKey,
              residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement | undefined,
              userVerification: (options.authenticatorSelection.userVerification as UserVerificationRequirement) || 'preferred',
            }
          : undefined,
        attestation: (options.attestation as AttestationConveyancePreference) || 'none',
      };

      const credential = (await navigator.credentials.create({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error('No credential returned');
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      await registerPasskey.mutateAsync({
        name: name || 'Passkey',
        credential: {
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: bufferToBase64url(response.attestationObject),
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
          },
        },
      });

      toast.success(t('settings.passkey_registered'));
      setOpen(false);
      setName('');
    } catch {
      toast.error(t('settings.passkey_register_failed'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          {t('settings.passkey_register')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.passkey_register')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.passkeys_desc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="passkey-name">{t('settings.passkey_name')}</Label>
          <Input
            id="passkey-name"
            className="mt-2"
            placeholder={t('settings.passkey_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleRegister} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t('settings.passkey_register')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
