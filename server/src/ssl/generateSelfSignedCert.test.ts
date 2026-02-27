import crypto from 'node:crypto';
import { generateSelfSignedCert } from './generateSelfSignedCert';

describe('generateSelfSignedCert', () => {
  it('should return PEM-encoded cert and key', async () => {
    const { cert, key } = await generateSelfSignedCert();
    expect(cert).toContain('-----BEGIN CERTIFICATE-----');
    expect(key).toContain('-----BEGIN');
  });

  it('should generate a valid X.509 certificate with CN=localhost', async () => {
    const { cert } = await generateSelfSignedCert();
    const x509 = new crypto.X509Certificate(cert);
    expect(x509.subject).toContain('CN=localhost');
  });

  it('should include SAN for localhost and 127.0.0.1', async () => {
    const { cert } = await generateSelfSignedCert();
    const x509 = new crypto.X509Certificate(cert);
    const san = x509.subjectAltName || '';
    expect(san).toContain('localhost');
    expect(san).toContain('127.0.0.1');
  });

  it('should generate a cert that matches the key', async () => {
    const { cert, key } = await generateSelfSignedCert();
    const x509 = new crypto.X509Certificate(cert);
    const privateKey = crypto.createPrivateKey(key);
    expect(x509.checkPrivateKey(privateKey)).toBe(true);
  });
});
