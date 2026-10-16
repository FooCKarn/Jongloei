// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IJongloeiTicket {
    function mint(address to, uint256 eventId) external returns (uint256 tokenId);
}

/// @title JONGLOEI mint guard
/// @notice The only MINTER_ROLE holder on JongloeiTicket once deployed. Each ticket of an order
/// has one key (keccak256 of "<order id>:<index>", made by the backend), and a key mints at most
/// once, so a write that is sent again after thirdweb lost track of it reverts instead of
/// issuing a second ticket. Sits in front of the deployed ticket contract, so existing tickets
/// stay where they are.
contract JongloeiMintGuard is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IJongloeiTicket public immutable ticket;
    mapping(bytes32 ticketKey => uint256) public tokenOfKey;

    event KeyMinted(bytes32 indexed ticketKey, uint256 indexed tokenId);

    error AlreadyMinted(bytes32 ticketKey, uint256 tokenId);
    error InvalidKey();

    constructor(address admin, address relayer, IJongloeiTicket ticket_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
        ticket = ticket_;
    }

    /// @notice Mints one ticket for `ticketKey`; reverts if that key already has one.
    function mintOnce(address to, uint256 eventId, bytes32 ticketKey)
        external
        onlyRole(RELAYER_ROLE)
        returns (uint256 tokenId)
    {
        if (ticketKey == bytes32(0)) revert InvalidKey();
        uint256 existing = tokenOfKey[ticketKey];
        if (existing != 0) revert AlreadyMinted(ticketKey, existing);
        tokenId = ticket.mint(to, eventId); // token ids start at 1, so 0 means "not minted"
        tokenOfKey[ticketKey] = tokenId;
        emit KeyMinted(ticketKey, tokenId);
    }
}
