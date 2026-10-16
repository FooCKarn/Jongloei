// Tests for the entry QR (src/evm.js, src/checkin.js). Run: node --test tests/worker/*.test.mjs
// Fixtures were made with ethers v6 (Wallet 0x1111…11, signTypedData) and are checked here
// against our own keccak / EIP-712 / signer recovery. The routes are covered by
// tests/worker/checkin-api.e2e.mjs against `wrangler dev` with a mock thirdweb and Fuji RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, toHex, entryPassDigest, recoverAddress, SELECTORS } from '../../src/evm.js';
import { encodeEntryCode, parseEntryCode, judgeEntry, judgeChain, QR_TTL } from '../../src/checkin.js';

const CONTRACT = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const OWNER = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a';
const SIG = '0x1325e88b73d5e9d12d7baf51b6044af280da387f990527f67c69535079b6d316157c325a3b0e926e80e342188192f7d2cab1e07b34cc0e96117f83ed10a238531c';
const TS = 1760550000;

test('keccak256 matches known hashes', () => {
  assert.equal(toHex(keccak256('')), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(toHex(keccak256('a'.repeat(200))), '0x96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d'); // 2 blocks
  assert.equal(SELECTORS.ownerOf, '0x6352211e');
});

test('EIP-712 EntryPass digest and signer recovery match ethers', () => {
  const digest = entryPassDigest(7, TS, 43113, CONTRACT);
  assert.equal(toHex(digest), '0x8d25ff9a7d7de9fc9cbc6abb2a753a0234ada40b93f5dac4c37cc9f173e909b4');
  assert.equal(recoverAddress(digest, SIG), OWNER);
  // the same signature over another token or time recovers someone else
  assert.notEqual(recoverAddress(entryPassDigest(8, TS, 43113, CONTRACT), SIG), OWNER);
  assert.notEqual(recoverAddress(entryPassDigest(7, TS + 1, 43113, CONTRACT), SIG), OWNER);
  assert.equal(recoverAddress(digest, '0x1234'), null);
  assert.equal(recoverAddress(digest, SIG.slice(0, -2) + '1d'), null); // v = 29
});

test('entry code round trip and malformed codes', () => {
  const code = encodeEntryCode(7, TS, SIG);
  assert.match(code, /^JL1\.7\.1760550000\.[A-Za-z0-9_-]{87}$/);
  assert.deepEqual(parseEntryCode(code), { tokenId: 7, ts: TS, signature: SIG });
  for (const bad of ['', 'hello', code.replace('JL1', 'JL2'), code.slice(0, -3), 'JL1.0.1.' + code.split('.')[3], code + '<x>']) {
    assert.equal(parseEntryCode(bad), null, bad);
  }
});

const ticket = (over = {}) => ({ id: 't1', token_id: 7, event_id: 'ev-1', status: 'active', owner_wallet: OWNER, ...over });
const event = (over = {}) => ({ id: 'ev-1', cancelled_at: null, ends_at: null, chain_event_id: 5, ...over });
const judge = (over = {}) => judgeEntry({
  entry: { tokenId: 7, ts: TS }, nowSec: TS + 10, ticket: ticket(), event: event(), scanEventId: 'ev-1', signer: OWNER, ...over,
});

test('scan rules (context section 8: Valid / Invalid with a reason)', () => {
  assert.equal(judge(), null);
  assert.equal(judge({ entry: null }), 'malformed');
  assert.equal(judge({ nowSec: TS + QR_TTL }), null);
  assert.equal(judge({ nowSec: TS + QR_TTL + 1 }), 'expired');      // screenshot older than 60 s
  assert.equal(judge({ nowSec: TS - 15 }), null);
  assert.equal(judge({ nowSec: TS - 16 }), 'future');
  assert.equal(judge({ ticket: null }), 'unknown_ticket');
  assert.equal(judge({ signer: '0x' + '22'.repeat(20) }), 'bad_signature'); // e.g. the seller's old QR
  assert.equal(judge({ signer: null }), 'bad_signature');
  assert.equal(judge({ scanEventId: 'ev-2' }), 'wrong_event');
  assert.equal(judge({ event: event({ cancelled_at: 1 }) }), 'event_cancelled');
  assert.equal(judge({ event: event({ ends_at: (TS - 1) * 1000 }) }), 'event_ended');
  assert.equal(judge({ ticket: ticket({ status: 'used' }) }), 'already_used');
  assert.equal(judge({ ticket: ticket({ status: 'listed' }) }), 'listed');
  assert.equal(judge({ ticket: ticket({ status: 'minting' }) }), 'not_issued');
  // a forged code says nothing about the ticket's status
  assert.equal(judge({ ticket: ticket({ status: 'used' }), signer: null }), 'bad_signature');
});

test('chain check: ownerOf, used, eventOf', () => {
  const ok = { owner: OWNER, used: false, eventOf: 5 };
  assert.equal(judgeChain(ok, ticket(), event()), null);
  assert.equal(judgeChain({ ...ok, used: true }, ticket(), event()), 'already_used');
  assert.equal(judgeChain({ ...ok, owner: '0x' + '33'.repeat(20) }, ticket(), event()), 'chain_mismatch');
  assert.equal(judgeChain({ ...ok, owner: null }, ticket(), event()), 'chain_mismatch');
  assert.equal(judgeChain({ ...ok, eventOf: 6 }, ticket(), event()), 'wrong_event');
});
