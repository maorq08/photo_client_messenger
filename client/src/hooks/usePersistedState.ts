import { useState, useCallback } from 'react';

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Validate numeric values are within reasonable bounds
        if (typeof parsed === 'number' && (isNaN(parsed) || !isFinite(parsed))) {
          return defaultValue;
        }
        return parsed;
      }
    } catch {
      // Invalid JSON or localStorage unavailable
    }
    return defaultValue;
  });

  const setPersistedState = useCallback((value: T) => {
    setState(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage unavailable or quota exceeded
    }
  }, [key]);

  return [state, setPersistedState];
}
