// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JongloeiTicket} from "../src/JongloeiTicket.sol";

/// forge script script/Deploy.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_KEY
/// Env: ADMIN (team wallet), RELAYER (thirdweb relayer server wallet), BASE_URI (optional).
contract Deploy is Script {
    function run() external returns (JongloeiTicket ticket) {
        address admin = vm.envAddress("ADMIN");
        address relayer = vm.envAddress("RELAYER");
        string memory baseURI = vm.envOr("BASE_URI", string(""));
        vm.startBroadcast();
        ticket = new JongloeiTicket(admin, relayer, baseURI);
        vm.stopBroadcast();
        console.log("JongloeiTicket deployed at", address(ticket));
    }
}
