import { useState } from 'react';
import { View } from 'react-native';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { stripePublishableKey } from '../lib/cardWallet';
import { Button, colors } from './ui';

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function ConfirmHold({ onConfirmed, onError }: { onConfirmed: () => Promise<void>; onError: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  return <View style={{ gap: 12 }}>
    <PaymentElement />
    <Button title={busy ? 'Confirming card' : 'Confirm card'} disabled={!stripe || !elements || busy} onPress={() => {
      void (async () => {
        if (!stripe || !elements) return;
        setBusy(true);
        const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
        if (result.error) {
          onError(result.error.message ?? 'The card hold was not approved.');
          setBusy(false);
          return;
        }
        try {
          await onConfirmed();
        } catch (error) {
          onError(error instanceof Error ? error.message : 'The card hold was not approved.');
          setBusy(false);
        }
      })();
    }} />
  </View>;
}

export function CardWalletSheet({ clientSecret, onConfirmed, onError }: {
  clientSecret: string;
  onConfirmed: () => Promise<void>;
  onError: (message: string) => void;
}) {
  if (!stripePromise) return null;
  return <Elements stripe={stripePromise} options={{
    clientSecret,
    appearance: { variables: { colorPrimary: colors.primary, borderRadius: '3px', fontFamily: 'system-ui, sans-serif' } },
  }}>
    <ConfirmHold onConfirmed={onConfirmed} onError={onError} />
  </Elements>;
}
