import { useEffect, useCallback } from 'react';
import { useOrg, tx } from '../data/store';
import { can } from '../services/org';
import { ctxOf } from '../services/core';
import { useToast } from '../components/ui';

export function usePerm() {
  const { org, role } = useOrg();
  return useCallback((perm) => can(org, role, perm), [org, role]);
}

// Run a service mutation with the current context; reports errors as toasts.
export function useAction() {
  const toast = useToast();
  return useCallback((fn, { success, error } = {}) => {
    try {
      const r = tx((draft) => fn(draft, ctxOf(draft)));
      if (success) toast.success(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      console.error(e);
      toast.error(error || e.message || 'Something went wrong.');
      return undefined;
    }
  }, [toast]);
}

export function useTitle(title) {
  useEffect(() => { document.title = title ? `${title} · Relayline` : 'Relayline'; }, [title]);
}
