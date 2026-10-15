# JONGLOEI ticket contract

**Deployed on Avalanche Fuji:** [`0xef36fcbdED316dEd4367636a6c85d73bFD5e2735`](https://testnet.snowtrace.io/address/0xef36fcbdED316dEd4367636a6c85d73bFD5e2735), relayer `0xDb5C1E726f8777694DF438c96dcCB57055f6B260` (thirdweb server wallet `jongloei-relayer`). Details in `deployments/fuji.json`; the ABI is in `abi/JongloeiTicket.json`.

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
