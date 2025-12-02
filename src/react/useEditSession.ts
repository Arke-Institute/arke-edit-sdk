/**
 * React hook for managing edit sessions
 */

import { useState, useCallback, useRef } from 'react';
import type { ArkeEditSDK } from '../sdk';
import type { EditSession } from '../session';
import type { EditMode, EditStatus, EditResult, EditScope, RegeneratableComponent } from '../types';

export interface UseEditSessionOptions {
  onSaved?: (result: EditResult) => void;
  onComplete?: (status: EditStatus) => void;
  onError?: (error: Error) => void;
}

export interface UseEditSessionReturn {
  // Session state
  session: EditSession | null;
  loading: boolean;
  saving: boolean;
  status: EditStatus | null;
  error: string | null;

  // Actions
  startSession: (mode: EditMode) => Promise<void>;
  endSession: () => void;
  submit: (note: string) => Promise<EditResult | undefined>;

  // Convenience methods that delegate to session
  setPrompt: (target: string, prompt: string) => void;
  setContent: (component: string, content: string) => void;
  addCorrection: (original: string, corrected: string, sourceFile?: string) => void;
  setScope: (scope: Partial<EditScope>) => void;
}

export function useEditSession(
  sdk: ArkeEditSDK,
  pi: string,
  options?: UseEditSessionOptions
): UseEditSessionReturn {
  const [session, setSession] = useState<EditSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<EditStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use ref to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startSession = useCallback(
    async (mode: EditMode) => {
      setLoading(true);
      setError(null);

      try {
        const newSession = sdk.createSession(pi, { mode });
        await newSession.load();
        setSession(newSession);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        optionsRef.current?.onError?.(err);
      } finally {
        setLoading(false);
      }
    },
    [sdk, pi]
  );

  const endSession = useCallback(() => {
    setSession(null);
    setStatus(null);
    setError(null);
  }, []);

  const submit = useCallback(
    async (note: string): Promise<EditResult | undefined> => {
      if (!session) {
        setError('No active session');
        return undefined;
      }

      setSaving(true);
      setError(null);

      try {
        const result = await session.submit(note);
        optionsRef.current?.onSaved?.(result);

        // Start polling if reprocessing
        if (result.reprocess) {
          setStatus({ phase: 'reprocessing', saveComplete: true });

          const finalStatus = await session.waitForCompletion({
            onProgress: setStatus,
          });

          setStatus(finalStatus);
          optionsRef.current?.onComplete?.(finalStatus);
        } else {
          const completeStatus: EditStatus = { phase: 'complete', saveComplete: true };
          setStatus(completeStatus);
          optionsRef.current?.onComplete?.(completeStatus);
        }

        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        setStatus({ phase: 'error', saveComplete: false, error: err.message });
        optionsRef.current?.onError?.(err);
        return undefined;
      } finally {
        setSaving(false);
      }
    },
    [session]
  );

  // Convenience methods
  const setPrompt = useCallback(
    (target: string, prompt: string) => {
      session?.setPrompt(target as RegeneratableComponent | 'general', prompt);
    },
    [session]
  );

  const setContent = useCallback(
    (component: string, content: string) => {
      session?.setContent(component, content);
    },
    [session]
  );

  const addCorrection = useCallback(
    (original: string, corrected: string, sourceFile?: string) => {
      session?.addCorrection(original, corrected, sourceFile);
    },
    [session]
  );

  const setScope = useCallback(
    (scope: Partial<EditScope>) => {
      session?.setScope(scope);
    },
    [session]
  );

  return {
    session,
    loading,
    saving,
    status,
    error,
    startSession,
    endSession,
    submit,
    setPrompt,
    setContent,
    addCorrection,
    setScope,
  };
}
