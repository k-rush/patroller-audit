import { connect } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const path = process.env.COSMOS_CERT_PATH ?? '/emulator-certs/emulator.pem';

function readCertificate() {
  return new Promise((resolve, reject) => {
    // Trust-on-first-use is restricted to this local service; application traffic pins the exact certificate.
    const socket = connect({ host: 'cosmos-emulator', port: 8081, rejectUnauthorized: false }, () => {
      try {
        const raw = socket.getPeerCertificate().raw;
        if (!raw) throw new Error('The emulator did not provide a certificate.');
        resolve(new X509Certificate(raw).toString());
      } catch (error) {
        reject(error);
      } finally {
        socket.end();
      }
    });
    socket.setTimeout(5000, () => socket.destroy(new Error('Certificate handshake timed out.')));
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Certificate handshake closed.')));
  });
}

let captured = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const ready = await fetch('http://cosmos-emulator:8080/ready', { signal: AbortSignal.timeout(3000) });
    if (!ready.ok) throw new Error('Cosmos is not ready.');
    const certificate = await readCertificate();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${certificate}\n`, { mode: 0o644 });
    captured = true;
    break;
  } catch {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
if (!captured) throw new Error('Unable to pin the local Cosmos certificate.');
