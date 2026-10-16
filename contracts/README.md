# JONGLOEI ticket contract

**Deployed on Avalanche Fuji:** [`0xef36fcbdED316dEd4367636a6c85d73bFD5e2735`](https://testnet.snowtrace.io/address/0xef36fcbdED316dEd4367636a6c85d73bFD5e2735), relayer `0x8f79c4dE47287b129E2B7279Ae34c779D1eFA952` (ERC-4337 smart account of thirdweb server wallet `jongloei-relayer`; Fuji has no EIP-7702, so writes must come from the smart account, not the signer `0xDb5C…B260`). Details in `deployments/fuji.json`; the ABI is in `abi/JongloeiTicket.json`.

`src/JongloeiTicket.sol` is the minimal ticket contract from context v3.4 section 8 (Core A5): an ERC-721 on Avalanche Fuji where only the platform relayer can act.

| Function | Who | What |
|---|---|---|
| `mint(to, eventId)` | `MINTER_ROLE` (relayer) | Issues the next token id to the buyer's wallet after the backend has verified payment. Returns the token id and emits `TicketMinted`. |
| `operatorTransfer(tokenId, to)` | `OPERATOR_ROLE` (relayer) | Moves a ticket to its new holder after a paid resale. Rejects used tickets. |
| `markUsed(tokenId)` | `OPERATOR_ROLE` (relayer) | Marks a ticket used at the door, once. |
| `setBaseURI(uri)` | `DEFAULT_ADMIN_ROLE` | Sets where `tokenURI` points (`<uri><tokenId>`). |
| `ownerOf`, `eventOf`, `used` | anyone | Read by the QR scanner and the backend. |

Holders cannot `transferFrom`, `safeTransferFrom`, `approve` or `setApprovalForAll`; every one reverts with `TransferDisabled`. Money, prices and time rules (resale delay, price cap, transfer cutoff) are enforced by the backend ledger, not here.

## Build and test

Needs [Foundry](https://getfoundry.sh) and Node.

```sh
cd contracts
npm install      # OpenZeppelin v5 and forge-std into node_modules
forge test -vv
```

## Deploy to Fuji

1. Create the relayer: a second thirdweb server wallet (for example identifier `jongloei-relayer`) and fund it with test AVAX from the Fuji faucet. Its address is `RELAYER`.
2. Pick an admin address you control (`ADMIN`), and a deployer key with a little test AVAX (`DEPLOYER_KEY`; can be the same wallet as the admin).
3. Deploy:

```sh
ADMIN=0x... RELAYER=0x... BASE_URI=https://<worker-domain>/api/tickets/ \
  forge script script/Deploy.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_KEY
```

4. Save the printed address and copy the ABI from `out/JongloeiTicket.sol/JongloeiTicket.json` for the Worker.

Never commit a private key.

## Mint guard

`src/JongloeiMintGuard.sol` sits in front of the deployed ticket contract and becomes its only minter. The Worker gives every ticket a key, `keccak256("<order id>:<index>")`, which stays the same on every attempt, and `mintOnce(to, eventId, ticketKey)` reverts with `AlreadyMinted` when that key already has a token. If thirdweb loses track of a mint that landed and the Worker sends it again, the second write reverts on chain and no second ticket is issued. A batch is all or nothing, so a re-sent order mints none of its tickets twice. `tokenOfKey(key)` returns the token a key minted. Existing tickets stay on the same contract.

**Rollout (Remix, same settings as the ticket: solc 0.8.26, optimizer 200, evm cancun), in this order:**

1. Deploy `JongloeiMintGuard` with `admin` = the team MetaMask wallet, `relayer` = `0x8f79c4dE47287b129E2B7279Ae34c779D1eFA952`, `ticket_` = `0xef36fcbdED316dEd4367636a6c85d73bFD5e2735`. (Or `forge script script/DeployMintGuard.s.sol` with `ADMIN`, `RELAYER`, `TICKET`.)
2. On `JongloeiTicket`, from the admin wallet: `grantRole(MINTER_ROLE, <guard>)`. `MINTER_ROLE` = `0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`.
3. Set `MINT_GUARD_ADDRESS` to the guard's address in the root `wrangler.jsonc` `vars` and deploy the Worker. Workers Builds drops variables that were set only in the dashboard. Confirm with `POST /api/dev/test-mint` (admin): the mint should go through the guard.
4. On `JongloeiTicket`: `revokeRole(MINTER_ROLE, 0x8f79c4dE47287b129E2B7279Ae34c779D1eFA952)` and `revokeRole(MINTER_ROLE, 0xDb5C1E726f8777694DF438c96dcCB57055f6B260)`. Now nothing can mint except through the guard. Record the guard in `deployments/fuji.json`.

Doing step 4 before step 3 makes every mint fail until the variable is set. Those orders retry three times and then go to `needs_review`.
