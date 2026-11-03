import type { User } from 'firebase/auth';

export interface Incident {
  id: string;
  resortId: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  createdBy: string;
}

export interface IncidentRequest {
  id: string;
  latitude: number;
  longitude: number;
}

export function readPendingIncident(userId: string): IncidentRequest | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(`dispatch-pending:${userId}`) ?? 'null');
    if (value && typeof value.id === 'string' &&
        Number.isFinite(value.latitude) && Number.isFinite(value.longitude))
      return { id: value.id, latitude: value.latitude, longitude: value.longitude };
  } catch { /* Storage can be disabled by browser policy. */ }
}

export const resortTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'long',
}).format(new Date(value));

export async function api<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/incidents${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('This account does not have Summit West dispatcher access.');
    if (response.status === 401) throw new Error('Your session expired. Sign out and sign in again.');
    throw new Error('The incident service is unavailable. Try again.');
  }
  return response.json() as Promise<T>;
}

export async function loadIncidents(user: User) {
  const incidents: Incident[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: Incident[]; cursor: string | null } = await api(user,
      cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
    incidents.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return incidents;
}
