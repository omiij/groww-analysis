/**
 * Minimal dependency-free hash router.
 *
 * Uses the URL hash (e.g. `#/about`) so it works without any server config
 * and without extra npm dependencies. Paths are normalised to always start
 * with a single leading slash, e.g. "/", "/about".
 */
import { useEffect, useState } from 'react';

/** Read the current route path from the location hash. */
export function getCurrentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Programmatically navigate to a path (updates the hash). */
export function navigate(path: string): void {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (getCurrentPath() !== normalised) {
    window.location.hash = normalised;
  }
}

/**
 * Subscribe to hash changes and get the current path.
 * Re-renders the consuming component whenever the route changes.
 */
export function useHashRoute(): string {
  const [path, setPath] = useState<string>(() => getCurrentPath());

  useEffect(() => {
    const onChange = () => setPath(getCurrentPath());
    window.addEventListener('hashchange', onChange);
    // Ensure there is always a hash so refreshes land on a known route.
    if (!window.location.hash) {
      window.location.replace('#/');
    }
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return path;
}
