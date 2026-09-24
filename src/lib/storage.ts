import type { RouteData } from '../types';

const KEY = 'route-overlay:saved-routes';

export function listSavedRoutes(): RouteData[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RouteData[];
  } catch {
    return [];
  }
}

export function saveRoute(route: RouteData): void {
  const routes = listSavedRoutes().filter((r) => r.id !== route.id);
  routes.unshift({ ...route, updatedAt: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(routes.slice(0, 25)));
}

export function deleteRoute(id: string): void {
  const routes = listSavedRoutes().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(routes));
}
