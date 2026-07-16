import { useState, useEffect, useCallback, useMemo } from 'react';

export type PersistenceStatus = 'saved' | 'unsaved' | 'saving' | 'failed';

export interface UsePersistenceOptions<T> {
  onSave: (value: T) => Promise<T | void>;
  equals?: (a: T, b: T) => boolean;
}

/**
 * A custom React hook that tracks loading, saving, and dirty states for configuration sections.
 * Provides status indicators like 'unsaved', 'saving', 'saved', and 'failed' to be used in UI components.
 */
export function usePersistence<T>(
  persistedValue: T,
  currentValue: T,
  options: UsePersistenceOptions<T>
) {
  const { onSave, equals } = options;
  const [status, setStatus] = useState<PersistenceStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Default structural/value equality comparison helper
  const defaultEquals = useCallback((a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => defaultEquals(a[key], b[key]));
    }
    return false;
  }, []);

  const isDirty = useMemo(() => {
    const comparator = equals || defaultEquals;
    return !comparator(persistedValue, currentValue);
  }, [persistedValue, currentValue, equals, defaultEquals]);

  // Adjust status based on dirty changes, ignoring while saving or immediately failed
  useEffect(() => {
    if (status === 'saving') return;
    if (isDirty) {
      setStatus('unsaved');
    } else {
      setStatus('saved');
    }
  }, [isDirty, status]);

  const save = useCallback(async () => {
    setStatus('saving');
    setError(null);
    try {
      await onSave(currentValue);
      setStatus('saved');
      setLastSavedAt(new Date().toISOString());
      return true;
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
      setStatus('failed');
      return false;
    }
  }, [currentValue, onSave]);

  return {
    status,
    isDirty,
    error,
    lastSavedAt,
    save,
    setStatus,
  };
}
