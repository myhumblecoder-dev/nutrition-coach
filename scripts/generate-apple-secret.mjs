import { createSign, createPrivateKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Generates an ES256 JWT client secret for Sign in with Apple.
 * Uses only node:crypto to avoid external dependencies.
 */
export async function generateAppleClientSecret({
  privateKeyPem,
  teamId,
  keyId,
  clientId,
  now,
}) {
  const iat = Math.floor(now / 1000);
  const exp = iat + 13046400; // 5 months

  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  const payload = {
    iss: teamId,
    iat,
    exp,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const base64urlEncode = (obj) => {
    const str = JSON.stringify(obj);
    return Buffer.from(str).toString('base64url');
  };

  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(privateKeyPem);
  const signature = createSign('sha256').update(unsignedToken).sign({
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  const encodedSignature = Buffer.from(signature).toString('base64url');
  const token = `${unsignedToken}.${encodedSignature}`;

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-apple-secret.mjs')) {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1];
      params[key] = val;
      i++;
    }
  }

  const required = ['key', 'team-id', 'key-id', 'client-id'];
  const missing = required.filter((r) => !params[r]);

  if (missing.length > 0) {
    console.error(`Usage: node generate-apple-secret.mjs --key <p8_path> --team-id <id> --key-rypt <id> --client-id <id>`);
    console.error(`Missing arguments: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    const privateKeyPem = await readFile(params['key'], 'utf8');
    const result = await generateAppleClientSecret({
      privateKeyPem,
      teamId: params['team-id'],
      keyId: params['key-id'],
      clientId: params['client-id'],
      now: Date.now(),
    });

    process.stdout.write(result.token + '\n');
    process.stderr.write(`Expires at: ${result.expiresAt}\n`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }
}
