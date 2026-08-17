#!/usr/bin/env node
/**
 * Generates a Zcash *testnet* transparent address plus its private key, using
 * only Node built-ins. This exists so an operator can obtain the receiving
 * address ZITY watches (ZITY_TESTNET_RECEIVER_ADDRESS) without installing a
 * wallet toolchain first.
 *
 * Testnet only. The key is printed once and never stored: whoever holds it
 * controls anything paid to the address, so treat it like any other secret.
 *
 *   node scripts/new-testnet-address.mjs
 */
import { createECDH, createHash, randomBytes } from "node:crypto";

/** Zcash testnet P2PKH version bytes; these are what render the `tm` prefix. */
const TESTNET_P2PKH_PREFIX = Buffer.from([0x1d, 0x25]);
/** Zcash testnet WIF version byte, matching Bitcoin testnet. */
const TESTNET_WIF_PREFIX = Buffer.from([0xef]);

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const sha256 = (data) => createHash("sha256").update(data).digest();
const hash160 = (data) => createHash("ripemd160").update(sha256(data)).digest();
const checksum = (payload) => sha256(sha256(payload)).subarray(0, 4);

function base58Encode(buffer) {
  let value = BigInt(`0x${buffer.toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  // Leading zero bytes are not captured by the numeric conversion above.
  for (const byte of buffer) {
    if (byte !== 0) break;
    encoded = `${BASE58_ALPHABET[0]}${encoded}`;
  }
  return encoded;
}

const base58Check = (payload) => base58Encode(Buffer.concat([payload, checksum(payload)]));

function generate() {
  const curve = createECDH("secp256k1");
  // Retry guards against the vanishingly rare invalid scalar.
  let privateKey;
  do {
    privateKey = randomBytes(32);
    try {
      curve.setPrivateKey(privateKey);
      break;
    } catch {
      privateKey = null;
    }
  } while (!privateKey);

  const publicKey = curve.getPublicKey(null, "compressed");
  const address = base58Check(Buffer.concat([TESTNET_P2PKH_PREFIX, hash160(publicKey)]));
  // 0x01 suffix marks the key as producing a compressed public key.
  const wif = base58Check(Buffer.concat([TESTNET_WIF_PREFIX, privateKey, Buffer.from([0x01])]));

  return { address, wif };
}

const { address, wif } = generate();

process.stdout.write(`
Zcash TESTNET transparent address
=================================

  Address (public — put this in .env):
    ${address}

  Private key, WIF (SECRET — store offline, never commit):
    ${wif}

Next steps:
  1. .env  ->  ZITY_TESTNET_RECEIVER_ADDRESS=${address}
  2. Fund a paying wallet at https://zcashfaucet.jinolabs.xyz/
  3. Pay the exact amount shown on the ZITY checkpoint QR to this address.

The private key is only needed to move funds back out. ZITY itself never
needs it: verification reads the public chain, it never spends.
`);
