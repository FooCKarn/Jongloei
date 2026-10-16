// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JongloeiMintGuard, IJongloeiTicket} from "../src/JongloeiMintGuard.sol";

/// forge script script/DeployMintGuard.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_KEY
/// Env: ADMIN (team wallet), RELAYER (relayer smart account), TICKET (JongloeiTicket address).
/// Afterwards the ticket admin grants MINTER_ROLE to the guard and revokes it from both relayer
/// addresses (contracts/README.md, "Mint guard").
contract DeployMintGuard is Script {
    function run() external returns (JongloeiMintGuard guard) {
        address admin = vm.envAddress("ADMIN");
        address relayer = vm.envAddress("RELAYER");
        address ticket = vm.envAddress("TICKET");
        vm.startBroadcast();
        guard = new JongloeiMintGuard(admin, relayer, IJongloeiTicket(ticket));
        vm.stopBroadcast();
        console.log("JongloeiMintGuard deployed at", address(guard));
    }
}
