// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title JONGLOEI ticket (MVP, context v3.4 section 8 "Contract ขั้นต่ำของ MVP")
/// @notice One NFT per ticket. Only the platform relayer can mint, move and mark tickets used;
/// holders cannot transfer or approve on their own, so resale has to go through the platform.
/// Money, prices and time rules live in the backend ledger, not here.
contract JongloeiTicket is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => uint256) public eventOf;
    mapping(uint256 tokenId => bool) public used;
    string private _base;

    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId);
    event TicketUsed(uint256 indexed tokenId);

    error TransferDisabled();
    error TicketAlreadyUsed(uint256 tokenId);
    error InvalidRecipient();

    constructor(address admin, address relayer, string memory baseURI_) ERC721("JONGLOEI Ticket", "JLT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, relayer);
        _grantRole(OPERATOR_ROLE, relayer);
        _base = baseURI_;
    }

    /// @notice Issues a ticket after the backend has verified the payment.
    /// Uses _mint, not _safeMint: user wallets may be smart accounts without onERC721Received.
    function mint(address to, uint256 eventId) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidRecipient();
        tokenId = nextTokenId++;
        eventOf[tokenId] = eventId;
        _mint(to, tokenId);
        emit TicketMinted(tokenId, to, eventId);
    }

    /// @notice Moves a ticket to its new holder after a paid resale on the platform.
    function operatorTransfer(uint256 tokenId, address to) external onlyRole(OPERATOR_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        if (used[tokenId]) revert TicketAlreadyUsed(tokenId);
        _requireOwned(tokenId);
        // auth = address(0) skips the owner/approval check; _update below lets only this path through.
        _update(to, tokenId, address(0));
    }

    /// @notice Marks a ticket as used when it is scanned at the door.
    function markUsed(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        _requireOwned(tokenId);
        if (used[tokenId]) revert TicketAlreadyUsed(tokenId);
        used[tokenId] = true;
        emit TicketUsed(tokenId);
    }

    function setBaseURI(string calldata baseURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _base = baseURI_;
    }

    // Every holder-initiated path (transferFrom, safeTransferFrom) reaches _update with
    // auth = msg.sender; mint and operatorTransfer pass auth = address(0).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (auth != address(0)) revert TransferDisabled();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert TransferDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert TransferDisabled();
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
