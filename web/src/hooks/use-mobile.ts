import { useCallback, useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

function getIsMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getIsMobileServerSnapshot() {
  return false;
}

function subscribeToMobile(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeToMobile, getIsMobileSnapshot, getIsMobileServerSnapshot);
}

export function useMobile(breakpoint = 768) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    [breakpoint],
  );
  const getSnapshot = useCallback(
    () => window.innerWidth < breakpoint,
    [breakpoint],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
