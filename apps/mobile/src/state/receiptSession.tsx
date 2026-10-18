import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ExtractedReceipt } from '@splitpool/contracts';

export type ReceiptSession = {
  billId: string;
  expectedVersion: number;
  draft: ExtractedReceipt;
};

type ReceiptSessionContextValue = {
  session: ReceiptSession | null;
  setSession: (session: ReceiptSession | null) => void;
};

const ReceiptSessionContext = createContext<ReceiptSessionContextValue | null>(null);

export function ReceiptSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ReceiptSession | null>(null);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return <ReceiptSessionContext.Provider value={value}>{children}</ReceiptSessionContext.Provider>;
}

export function useReceiptSession() {
  const context = useContext(ReceiptSessionContext);
  if (!context) throw new Error('useReceiptSession must be used within ReceiptSessionProvider');
  return context;
}
