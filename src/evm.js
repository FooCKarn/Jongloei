// Small EVM helpers for the entry QR (context A6), with no npm dependencies so the Worker
// still deploys without a build step:
//   keccak256, EIP-712 hashing of EntryPass { tokenId, ts }, secp256k1 signer recovery,
//   and the ABI bits for reading the ticket contract with eth_call.
// Only public data goes through here (signatures and hashes), so nothing needs constant time.

/* ---------- keccak256 ---------- */

const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// rotation offsets, indexed x + 5y
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rotl = (v, n) => n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK;

function keccakF(A) {
  const C = new Array(5), B = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) A[x + y] ^= D;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) A[x + y] = B[x + y] ^ (~B[(x + 1) % 5 + y] & MASK & B[(x + 2) % 5 + y]);
    }
    A[0] ^= RC[round];
  }
}

export function keccak256(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rate = 136;
  const padded = new Uint8Array(Math.floor(data.length / rate) * rate + rate);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const A = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
      A[i] ^= lane;
    }
    keccakF(A);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((A[i] >> BigInt(8 * b)) & 0xffn);
  return out;
}

/* ---------- bytes ---------- */

export const toHex = bytes => '0x' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export function fromHex(hex) {
  const s = String(hex).replace(/^0x/, '');
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('bad hex');
  return Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16));
}
const word = n => fromHex(BigInt(n).toString(16).padStart(64, '0'));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const bytesToBig = b => BigInt(toHex(b));

/* ---------- EIP-712: EntryPass { tokenId, ts } ---------- */

const DOMAIN_TYPE = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
const ENTRY_PASS_TYPE = keccak256('EntryPass(uint256 tokenId,uint256 ts)');

// The exact typed data the owner's wallet signs (sent to thirdweb as is).
export function entryPassTypedData(tokenId, ts, chainId, contract) {
  return {
    domain: { name: 'JongLoei', version: '1', chainId: String(chainId), verifyingContract: contract },
    types: { EntryPass: [{ name: 'tokenId', type: 'uint256' }, { name: 'ts', type: 'uint256' }] },
    primaryType: 'EntryPass',
    message: { tokenId: String(tokenId), ts: String(ts) },
  };
}

export function entryPassDigest(tokenId, ts, chainId, contract) {
  const domain = keccak256(concat(DOMAIN_TYPE, keccak256('JongLoei'), keccak256('1'), word(chainId), word(BigInt(contract))));
  const struct = keccak256(concat(ENTRY_PASS_TYPE, word(tokenId), word(ts)));
  return keccak256(concat(Uint8Array.of(0x19, 0x01), domain, struct));
}

/* ---------- secp256k1 signer recovery ---------- */

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };
function inv(a, m = P) {
  let [x, y, u, v] = [0n, 1n, m, mod(a, m)];
  while (v) { const q = u / v; [x, y] = [y, x - q * y]; [u, v] = [v, u - q * v]; }
  return mod(x, m);
}
function powMod(b, e, m = P) {
  let r = 1n; b = mod(b, m);
  for (; e > 0n; e >>= 1n, b = b * b % m) if (e & 1n) r = r * b % m;
  return r;
}
// Jacobian points [X, Y, Z]; Z = 0 is infinity.
function dbl([X, Y, Z]) {
  if (!Y || !Z) return [0n, 1n, 0n];
  const YY = Y * Y % P, S = 4n * X * YY % P, M = 3n * X * X % P;
  const X3 = mod(M * M - 2n * S);
  return [X3, mod(M * (S - X3) - 8n * YY * YY), 2n * Y * Z % P];
}
function add(p1, p2) {
  if (!p1[2]) return p2;
  if (!p2[2]) return p1;
  const [X1, Y1, Z1] = p1, [X2, Y2, Z2] = p2;
  const Z1Z1 = Z1 * Z1 % P, Z2Z2 = Z2 * Z2 % P;
  const U1 = X1 * Z2Z2 % P, U2 = X2 * Z1Z1 % P;
  const S1 = Y1 * Z2 % P * Z2Z2 % P, S2 = Y2 * Z1 % P * Z1Z1 % P;
  if (U1 === U2) return S1 === S2 ? dbl(p1) : [0n, 1n, 0n];
  const H = mod(U2 - U1), R = mod(S2 - S1), HH = H * H % P, HHH = H * HH % P, V = U1 * HH % P;
  const X3 = mod(R * R - HHH - 2n * V);
  return [X3, mod(R * (V - X3) - S1 * HHH), Z1 * Z2 % P * H % P];
}
// a*A + b*B (Shamir's trick)
function mulAdd(a, A, b, B) {
  const AB = add(A, B);
  let R = [0n, 1n, 0n];
  for (let i = 255; i >= 0; i--) {
    R = dbl(R);
    const bitA = (a >> BigInt(i)) & 1n, bitB = (b >> BigInt(i)) & 1n;
    if (bitA && bitB) R = add(R, AB);
    else if (bitA) R = add(R, A);
    else if (bitB) R = add(R, B);
  }
  return R;
}

// Returns the lowercase 0x address that produced the 65-byte signature over digest, or null.
export function recoverAddress(digest, signature) {
  let sig;
  try { sig = fromHex(signature); } catch (_) { return null; }
  if (sig.length !== 65 || digest.length !== 32) return null;
  const r = bytesToBig(sig.slice(0, 32)), s = bytesToBig(sig.slice(32, 64));
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v > 1 || r < 1n || r >= N || s < 1n || s >= N) return null;
  const x = r; // r >= P - N never happens in practice; such signatures are rejected
  const alpha = mod(x * x % P * x + 7n);
  let y = powMod(alpha, (P + 1n) / 4n);
  if (y * y % P !== alpha) return null;
  if ((y & 1n) !== BigInt(v)) y = P - y;
  const e = mod(bytesToBig(digest), N), rInv = inv(r, N);
  // Q = r^-1 (s R - e G)
  const [X, Y, Z] = mulAdd(mod(s * rInv, N), [x, y, 1n], mod(-e * rInv, N), [G[0], G[1], 1n]);
  if (!Z) return null;
  const zInv = inv(Z), zInv2 = zInv * zInv % P;
  const qx = X * zInv2 % P, qy = Y * zInv2 % P * zInv % P;
  const hash = keccak256(concat(word(qx), word(qy)));
  return toHex(hash.slice(12));
}

/* ---------- ticket contract reads (eth_call) ---------- */

const selector = sig => toHex(keccak256(sig).slice(0, 4));
export const SELECTORS = {
  ownerOf: selector('ownerOf(uint256)'),
  used: selector('used(uint256)'),
  eventOf: selector('eventOf(uint256)'),
  nextTokenId: selector('nextTokenId()'),
};
export const callData = (fn, tokenId) => SELECTORS[fn] + BigInt(tokenId).toString(16).padStart(64, '0');
