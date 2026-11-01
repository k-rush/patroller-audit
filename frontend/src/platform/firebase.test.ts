import { expect, test } from 'vitest';
import { initializeIdentity } from './firebase';

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
