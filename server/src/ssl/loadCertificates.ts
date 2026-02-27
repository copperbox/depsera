import fs from 'node:fs';
import logger from '../utils/logger';
import { generateSelfSignedCert, type CertKeyPair } from './generateSelfSignedCert';

export interface SSLConfig {
  enabled: boolean;
  certKeyPair?: CertKeyPair;
  httpPort?: number;
}

export async function resolveSSLConfig(): Promise<SSLConfig> {
  const enabled = process.env.ENABLE_HTTPS === 'true';
  if (!enabled) {
    return { enabled: false };
  }

  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;

  if ((certPath && !keyPath) || (!certPath && keyPath)) {
    throw new Error(
      'Both SSL_CERT_PATH and SSL_KEY_PATH must be provided together, or omit both for a self-signed certificate.',
    );
  }

  let certKeyPair: CertKeyPair;

  if (certPath && keyPath) {
    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL certificate file not found: ${certPath}`);
    }
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL key file not found: ${keyPath}`);
    }
    certKeyPair = {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
    };
    logger.info({ certPath, keyPath }, 'loaded SSL certificates from disk');
  } else {
    certKeyPair = await generateSelfSignedCert();
  }

  const httpPortRaw = process.env.HTTP_PORT;
  let httpPort: number | undefined;
  if (httpPortRaw) {
    httpPort = parseInt(httpPortRaw, 10);
    if (isNaN(httpPort) || httpPort < 0 || httpPort > 65535) {
      throw new Error(`Invalid HTTP_PORT value: ${httpPortRaw}`);
    }
  }

  return { enabled: true, certKeyPair, httpPort };
}
