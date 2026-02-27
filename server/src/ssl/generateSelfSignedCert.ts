import { generate } from 'selfsigned';
import logger from '../utils/logger';

export interface CertKeyPair {
  cert: string;
  key: string;
}

export async function generateSelfSignedCert(): Promise<CertKeyPair> {
  logger.warn(
    'generating self-signed certificate for HTTPS — ' +
      'this is NOT suitable for production. ' +
      'Provide SSL_CERT_PATH and SSL_KEY_PATH for real certificates.',
  );

  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  });

  return { cert: pems.cert, key: pems.private };
}
