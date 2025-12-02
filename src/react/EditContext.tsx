/**
 * React context for sharing SDK instance
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ArkeEditSDK } from '../sdk';
import type { ArkeClientConfig } from '../types';

interface EditContextValue {
  sdk: ArkeEditSDK;
}

const EditContext = createContext<EditContextValue | null>(null);

interface EditProviderProps {
  config: ArkeClientConfig;
  children: ReactNode;
}

/**
 * Provider component for sharing ArkeEditSDK instance
 */
export function EditProvider({ config, children }: EditProviderProps) {
  const sdk = useMemo(() => new ArkeEditSDK(config), [config]);

  const value = useMemo(() => ({ sdk }), [sdk]);

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

/**
 * Hook to access the shared SDK instance
 */
export function useEditContext(): EditContextValue {
  const context = useContext(EditContext);

  if (!context) {
    throw new Error('useEditContext must be used within an EditProvider');
  }

  return context;
}
