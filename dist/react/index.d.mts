import { A as ArkeEditSDK, r as EditResult, t as EditStatus, d as EditSession, f as EditMode, k as EditScope, e as ArkeClientConfig } from '../sdk-C_FOkQmV.mjs';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

/**
 * React hook for managing edit sessions
 */

interface UseEditSessionOptions {
    onSaved?: (result: EditResult) => void;
    onComplete?: (status: EditStatus) => void;
    onError?: (error: Error) => void;
}
interface UseEditSessionReturn {
    session: EditSession | null;
    loading: boolean;
    saving: boolean;
    status: EditStatus | null;
    error: string | null;
    startSession: (mode: EditMode) => Promise<void>;
    endSession: () => void;
    submit: (note: string) => Promise<EditResult | undefined>;
    setPrompt: (target: string, prompt: string) => void;
    setContent: (component: string, content: string) => void;
    addCorrection: (original: string, corrected: string, sourceFile?: string) => void;
    setScope: (scope: Partial<EditScope>) => void;
}
declare function useEditSession(sdk: ArkeEditSDK, pi: string, options?: UseEditSessionOptions): UseEditSessionReturn;

interface EditContextValue {
    sdk: ArkeEditSDK;
}
interface EditProviderProps {
    config: ArkeClientConfig;
    children: ReactNode;
}
/**
 * Provider component for sharing ArkeEditSDK instance
 */
declare function EditProvider({ config, children }: EditProviderProps): react_jsx_runtime.JSX.Element;
/**
 * Hook to access the shared SDK instance
 */
declare function useEditContext(): EditContextValue;

export { EditProvider, useEditContext, useEditSession };
