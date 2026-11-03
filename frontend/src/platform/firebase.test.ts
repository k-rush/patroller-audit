import { afterEach, expect, test, vi } from 'vitest';
import { initializeIdentity } from './firebase';

afterEach(() => vi.unstubAllGlobals());

test.each([
  'https://localhost:9099',
  'http://firebase.example.com:9099',
  'http://localhost:9099/path',
])('rejects unsafe emulator URL %s before initializing Firebase', (url) => {
  expect(() => initializeIdentity({ projectId: 'demo-patroller-audit' }, url)).toThrow();
});

test('rejects real projects when connecting to an emulator', () => {
  expect(() => initializeIdentity({ projectId: 'patroller-audit-test' }, 'http://localhost:9099')).toThrow();
});

test.each([
  { hostname: 'patrol.example.test', protocol: 'http:' },
  { hostname: 'localhost', protocol: 'https:' },
])('rejects emulator initialization outside loopback HTTP: %s', location => {
  vi.stubGlobal('window', { location });
  expect(() => initializeIdentity({ projectId: 'demo-patroller-audit' }, 'http://localhost:9099')).toThrow();
});
