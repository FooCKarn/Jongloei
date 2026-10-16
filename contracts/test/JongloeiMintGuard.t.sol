// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {JongloeiTicket} from "../src/JongloeiTicket.sol";
import {JongloeiMintGuard, IJongloeiTicket} from "../src/JongloeiMintGuard.sol";

contract JongloeiMintGuardTest is Test {
    JongloeiTicket ticket;
    JongloeiMintGuard guard;
    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");
    address alice = makeAddr("alice");
    uint256 constant EVENT_ID = 4;
    bytes32 constant KEY = keccak256("b3162ea4-ec79-49bd-97af-90212e50c742:0");

    function setUp() public {
        ticket = new JongloeiTicket(admin, relayer, "");
        guard = new JongloeiMintGuard(admin, relayer, IJongloeiTicket(address(ticket)));
        // The rollout: the guard becomes the only minter.
        vm.startPrank(admin);
        ticket.grantRole(ticket.MINTER_ROLE(), address(guard));
        ticket.revokeRole(ticket.MINTER_ROLE(), relayer);
        vm.stopPrank();
    }

    function test_MintsOncePerKey() public {
        vm.prank(relayer);
        uint256 tokenId = guard.mintOnce(alice, EVENT_ID, KEY);
        assertEq(tokenId, 1);
        assertEq(ticket.ownerOf(1), alice);
        assertEq(ticket.eventOf(1), EVENT_ID);
        assertEq(guard.tokenOfKey(KEY), 1);

        vm.expectRevert(abi.encodeWithSelector(JongloeiMintGuard.AlreadyMinted.selector, KEY, 1));
        vm.prank(relayer);
        guard.mintOnce(alice, EVENT_ID, KEY);
        assertEq(ticket.balanceOf(alice), 1);
    }

    function test_OtherKeysStillMint() public {
        vm.startPrank(relayer);
        guard.mintOnce(alice, EVENT_ID, KEY);
        assertEq(guard.mintOnce(alice, EVENT_ID, keccak256("b3162ea4-ec79-49bd-97af-90212e50c742:1")), 2);
        vm.stopPrank();
    }

    function test_EmitsTicketMintedFromTheTicketContract() public {
        vm.expectEmit(true, true, true, true, address(ticket));
        emit JongloeiTicket.TicketMinted(1, alice, EVENT_ID);
        vm.prank(relayer);
        guard.mintOnce(alice, EVENT_ID, KEY);
    }

    function test_OnlyRelayer() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, guard.RELAYER_ROLE())
        );
        vm.prank(alice);
        guard.mintOnce(alice, EVENT_ID, KEY);
    }

    function test_ZeroKeyRejected() public {
        vm.expectRevert(JongloeiMintGuard.InvalidKey.selector);
        vm.prank(relayer);
        guard.mintOnce(alice, EVENT_ID, bytes32(0));
    }

    function test_RelayerCannotBypassTheGuard() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, ticket.MINTER_ROLE())
        );
        vm.prank(relayer);
        ticket.mint(alice, EVENT_ID);
    }

    function test_BatchRetryRevertsAsAWhole() public {
        bytes32 k1 = keccak256("order:1");
        bytes32 role = guard.RELAYER_ROLE();
        vm.prank(admin);
        guard.grantRole(role, address(this)); // this contract plays the relayer's smart account
        guard.mintOnce(alice, EVENT_ID, KEY);
        // A re-sent batch [k1, KEY] reverts on KEY, and k1 is rolled back with it.
        try this.batch(k1, KEY) {
            fail();
        } catch {}
        assertEq(guard.tokenOfKey(k1), 0);
        assertEq(ticket.balanceOf(alice), 1);
    }

    // Stands in for the smart account's executeBatch: all calls or none.
    function batch(bytes32 a, bytes32 b) external {
        guard.mintOnce(alice, EVENT_ID, a);
        guard.mintOnce(alice, EVENT_ID, b);
    }
}
