import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { afterEach, expect, test, vi } from 'vitest';
import { CommandCenter } from './App';
import type { Incident } from './dispatch';

vi.mock('./DispatchMap', () => ({
  default: ({ incidents, onCreate, onSelect, disabled }: {
    incidents: Incident[]; onCreate: (lat: number, lng: number) => void;
    onSelect: (id: string) => void; disabled: boolean;
  }) => <div><button disabled={disabled} onClick={() => onCreate(47.4206, -121.4213)}>Test map click</button>
    {incidents.map(item => <button key={item.id} onClick={() => onSelect(item.id)}>Marker {item.id}</button>)}</div>,
}));

const user = { uid: 'fictional-dispatcher', email: 'fictional@example.test',
  getIdToken: async () => 'test-token' } as User;
const incident: Incident = { id: '550e8400-e29b-41d4-a716-446655440000', resortId: 'summit-west',
  latitude: 47.4206, longitude: -121.4213, createdAt: '2026-11-03T04:05:00Z', createdBy: user.uid };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

test('a saved map click opens Pacific-time details; close retains its reopenable marker', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ items: [], cursor: null }))
    .mockResolvedValueOnce(json(incident, 201));
  vi.stubGlobal('fetch', fetch);
  render(<CommandCenter user={user} onSignOut={async () => {}} />);
  const click = screen.getByRole('button', { name: 'Test map click' });
  await waitFor(() => expect(click).toBeEnabled());
  fireEvent.click(click);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Nov 2, 2026, 8:05:00 PM PST');
  fireEvent.click(screen.getByRole('button', { name: 'Close incident popout' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Marker ${incident.id}` }));
  expect(screen.getByRole('dialog')).toHaveTextContent(incident.id);
  fireEvent.click(screen.getByRole('button', { name: /^Incidents / }));
  fireEvent.click(screen.getByRole('button', { name: /Incident 550E8400/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent(incident.id);
});

test('a lost save response never appears saved and a manual retry preserves the exact request', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ items: [], cursor: null }))
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce(json(incident));
  vi.stubGlobal('fetch', fetch);
  render(<CommandCenter user={user} onSignOut={async () => {}} />);
  const click = screen.getByRole('button', { name: 'Test map click' });
  await waitFor(() => expect(click).toBeEnabled());
  fireEvent.click(click);
  expect(await screen.findByRole('alert')).toHaveTextContent('Save not confirmed');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(click).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body);
});

test('denied access cannot create incidents or masquerade as an empty successful load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 403)));
  render(<CommandCenter user={user} onSignOut={async () => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('does not have Summit West dispatcher access');
  expect(screen.getByRole('button', { name: 'Test map click' })).toBeDisabled();
});
