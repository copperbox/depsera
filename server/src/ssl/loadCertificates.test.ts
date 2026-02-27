import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSSLConfig } from './loadCertificates';
import { generateSelfSignedCert } from './generateSelfSignedCert';

describe('resolveSSLConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return enabled:false when ENABLE_HTTPS is not set', async () => {
    delete process.env.ENABLE_HTTPS;
    const config = await resolveSSLConfig();
    expect(config.enabled).toBe(false);
    expect(config.certKeyPair).toBeUndefined();
  });

  it('should return enabled:false when ENABLE_HTTPS is "false"', async () => {
    process.env.ENABLE_HTTPS = 'false';
    const config = await resolveSSLConfig();
    expect(config.enabled).toBe(false);
  });

  it('should throw when only SSL_CERT_PATH is provided', async () => {
    process.env.ENABLE_HTTPS = 'true';
    process.env.SSL_CERT_PATH = '/tmp/cert.pem';
    delete process.env.SSL_KEY_PATH;
    await expect(resolveSSLConfig()).rejects.toThrow('Both SSL_CERT_PATH and SSL_KEY_PATH');
  });

  it('should throw when only SSL_KEY_PATH is provided', async () => {
    process.env.ENABLE_HTTPS = 'true';
    delete process.env.SSL_CERT_PATH;
    process.env.SSL_KEY_PATH = '/tmp/key.pem';
    await expect(resolveSSLConfig()).rejects.toThrow('Both SSL_CERT_PATH and SSL_KEY_PATH');
  });

  it('should throw when cert file does not exist', async () => {
    process.env.ENABLE_HTTPS = 'true';
    process.env.SSL_CERT_PATH = '/nonexistent/cert.pem';
    process.env.SSL_KEY_PATH = '/nonexistent/key.pem';
    await expect(resolveSSLConfig()).rejects.toThrow('not found');
  });

  it('should load certs from disk when both paths exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-test-'));
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'key.pem');

    const { cert, key } = await generateSelfSignedCert();
    fs.writeFileSync(certPath, cert);
    fs.writeFileSync(keyPath, key);

    process.env.ENABLE_HTTPS = 'true';
    process.env.SSL_CERT_PATH = certPath;
    process.env.SSL_KEY_PATH = keyPath;

    const config = await resolveSSLConfig();
    expect(config.enabled).toBe(true);
    expect(config.certKeyPair!.cert).toBe(cert);
    expect(config.certKeyPair!.key).toBe(key);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should generate self-signed cert when no paths provided', async () => {
    process.env.ENABLE_HTTPS = 'true';
    delete process.env.SSL_CERT_PATH;
    delete process.env.SSL_KEY_PATH;
    const config = await resolveSSLConfig();
    expect(config.enabled).toBe(true);
    expect(config.certKeyPair).toBeDefined();
    expect(config.certKeyPair!.cert).toContain('BEGIN CERTIFICATE');
  });

  it('should parse HTTP_PORT when provided', async () => {
    process.env.ENABLE_HTTPS = 'true';
    process.env.HTTP_PORT = '3002';
    const config = await resolveSSLConfig();
    expect(config.httpPort).toBe(3002);
  });

  it('should leave httpPort undefined when HTTP_PORT is not set', async () => {
    process.env.ENABLE_HTTPS = 'true';
    delete process.env.HTTP_PORT;
    const config = await resolveSSLConfig();
    expect(config.httpPort).toBeUndefined();
  });

  it('should throw for invalid HTTP_PORT', async () => {
    process.env.ENABLE_HTTPS = 'true';
    process.env.HTTP_PORT = 'abc';
    await expect(resolveSSLConfig()).rejects.toThrow('Invalid HTTP_PORT');
  });

  it('should throw for HTTP_PORT out of range', async () => {
    process.env.ENABLE_HTTPS = 'true';
    process.env.HTTP_PORT = '99999';
    await expect(resolveSSLConfig()).rejects.toThrow('Invalid HTTP_PORT');
  });
});
