import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

export function initializeIdentity(options: FirebaseOptions, emulatorUrl?: string) {
  if (emulatorUrl) {
    const url = new URL(emulatorUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ||
        window.location.protocol !== 'http:' || !options.projectId?.startsWith('demo-') ||
        url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Firebase emulator configuration is restricted to local development.');
    }
  } else if (options.projectId?.startsWith('demo-')) {
    throw new Error('Demo projects require an explicit local emulator.');
  }
  const app = initializeApp(options);
  const auth = getAuth(app);
  if (emulatorUrl) connectAuthEmulator(auth, emulatorUrl);
  return auth;
}
