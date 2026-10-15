// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {JongloeiTicket} from "../src/JongloeiTicket.sol";

contract JongloeiTicketTest is Test {
    JongloeiTicket ticket;
    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant EVENT_ID = 7;

    function setUp() public {
        ticket = new JongloeiTicket(admin, relayer, "https://jongloei.example/api/tickets/");
    }

    function _mintToAlice() internal returns (uint256 tokenId) {
        vm.prank(relayer);
        tokenId = ticket.mint(alice, EVENT_ID);
    }

    function test_RelayerMintsToBuyer() public {
        uint256 tokenId = _mintToAlice();
        assertEq(tokenId, 1);
        assertEq(ticket.ownerOf(tokenId), alice);
        assertEq(ticket.eventOf(tokenId), EVENT_ID);
        assertEq(ticket.tokenURI(tokenId), "https://jongloei.example/api/tickets/1");
        vm.prank(relayer);
        assertEq(ticket.mint(bob, EVENT_ID), 2);
    }

    function test_OnlyMinterCanMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ticket.MINTER_ROLE())
        );
        vm.prank(alice);
        ticket.mint(alice, EVENT_ID);
    }

    function test_MintToZeroAddressReverts() public {
        vm.expectRevert(JongloeiTicket.InvalidRecipient.selector);
        vm.prank(relayer);
        ticket.mint(address(0), EVENT_ID);
    }

    function test_HolderCannotTransfer() public {
        uint256 tokenId = _mintToAlice();
        vm.startPrank(alice);
        vm.expectRevert(JongloeiTicket.TransferDisabled.selector);
        ticket.transferFrom(alice, bob, tokenId);
        vm.expectRevert(JongloeiTicket.TransferDisabled.selector);
        ticket.safeTransferFrom(alice, bob, tokenId);
        vm.stopPrank();
        assertEq(ticket.ownerOf(tokenId), alice);
    }

    function test_HolderCannotApprove() public {
        uint256 tokenId = _mintToAlice();
        vm.startPrank(alice);
        vm.expectRevert(JongloeiTicket.TransferDisabled.selector);
        ticket.approve(bob, tokenId);
        vm.expectRevert(JongloeiTicket.TransferDisabled.selector);
        ticket.setApprovalForAll(bob, true);
        vm.stopPrank();
    }

    function test_RelayerCannotUseTransferFromEither() public {
        uint256 tokenId = _mintToAlice();
        vm.expectRevert(JongloeiTicket.TransferDisabled.selector);
        vm.prank(relayer);
        ticket.transferFrom(alice, bob, tokenId);
    }

    function test_OperatorTransferMovesTicket() public {
        uint256 tokenId = _mintToAlice();
        vm.prank(relayer);
        ticket.operatorTransfer(tokenId, bob);
        assertEq(ticket.ownerOf(tokenId), bob);
        assertEq(ticket.balanceOf(alice), 0);
        assertEq(ticket.balanceOf(bob), 1);
    }

    function test_OnlyOperatorCanOperatorTransfer() public {
        uint256 tokenId = _mintToAlice();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ticket.OPERATOR_ROLE())
        );
        vm.prank(alice);
        ticket.operatorTransfer(tokenId, bob);
    }

    function test_OperatorTransferOfMissingTicketReverts() public {
        vm.expectRevert();
        vm.prank(relayer);
        ticket.operatorTransfer(99, bob);
    }

    function test_MarkUsedOnceThenNoTransfer() public {
        uint256 tokenId = _mintToAlice();
        vm.startPrank(relayer);
        ticket.markUsed(tokenId);
        assertTrue(ticket.used(tokenId));
        vm.expectRevert(abi.encodeWithSelector(JongloeiTicket.TicketAlreadyUsed.selector, tokenId));
        ticket.markUsed(tokenId);
        vm.expectRevert(abi.encodeWithSelector(JongloeiTicket.TicketAlreadyUsed.selector, tokenId));
        ticket.operatorTransfer(tokenId, bob);
        vm.stopPrank();
        assertEq(ticket.ownerOf(tokenId), alice);
    }

    function test_OnlyOperatorCanMarkUsed() public {
        uint256 tokenId = _mintToAlice();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ticket.OPERATOR_ROLE())
        );
        vm.prank(alice);
        ticket.markUsed(tokenId);
    }

    function test_AdminCanChangeBaseURI() public {
        uint256 tokenId = _mintToAlice();
        vm.prank(admin);
        ticket.setBaseURI("ipfs://new/");
        assertEq(ticket.tokenURI(tokenId), "ipfs://new/1");
        vm.expectRevert();
        vm.prank(alice);
        ticket.setBaseURI("x");
    }

    function test_SupportsErc721AndAccessControl() public view {
        assertTrue(ticket.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(ticket.supportsInterface(type(IAccessControl).interfaceId));
    }
}
