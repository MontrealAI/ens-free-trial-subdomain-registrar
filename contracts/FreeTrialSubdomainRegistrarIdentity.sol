// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

uint32 constant CANNOT_UNWRAP = 1;
uint32 constant CANNOT_TRANSFER = 1 << 2;
uint32 constant PARENT_CANNOT_CONTROL = 1 << 16;
uint32 constant IS_DOT_ETH = 1 << 17;

interface INameWrapperIdentity {
    function canModifyName(bytes32 node, address addr) external view returns (bool);
    function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry);
    function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool);
    function setSubnodeRecord(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);
}

interface IERC5192 {
    function locked(uint256 tokenId) external view returns (bool);
}

error Unauthorised(bytes32 node);
error ParentNotWrapped(bytes32 parentNode);
error ParentNameNotActive(bytes32 parentNode);
error ParentNotLocked(bytes32 parentNode);
error RegistrarNotAuthorised(bytes32 parentNode);
error ParentExpired(bytes32 parentNode);
error Unavailable(bytes32 node);
error InvalidOwner();
error LabelTooShort(uint256 length);
error LabelTooLong(uint256 length);
error DottedLabelNotAllowed(uint256 index);
error InvalidLabelCharacter(uint256 index, bytes1 character);
error EtherNotAccepted();
error InvalidWrapper();
error InvalidRegistry();
error Soulbound();
error IdentityNotEligible(uint256 tokenId);
error IdentityAlreadyAligned(uint256 tokenId);
error NonexistentToken(uint256 tokenId);

contract FreeTrialSubdomainRegistrarIdentity is ERC721, ReentrancyGuard, IERC5192 {
    using Address for address;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    INameWrapperIdentity public immutable wrapper;
    address public immutable registry;
    mapping(bytes32 => bool) public activeParents;

    event ParentConfigured(bytes32 indexed parentNode, bool active);
    event IdentityRegistered(bytes32 indexed parentNode, bytes32 indexed node, address indexed owner, string label, uint64 expiry);
    event IdentityClaimed(bytes32 indexed node, address indexed owner);
    event IdentitySynced(uint256 indexed tokenId, bool burned, address wrappedOwner, uint64 wrappedExpiry);

    constructor(address wrapper_, address registry_) ERC721("ENS Free Trial Identity", "ENSID") {
        if (wrapper_ == address(0)) revert InvalidWrapper();
        if (registry_ == address(0)) revert InvalidRegistry();
        wrapper = INameWrapperIdentity(wrapper_);
        registry = registry_;
    }

    receive() external payable {
        revert EtherNotAccepted();
    }

    fallback() external payable {
        revert EtherNotAccepted();
    }

    modifier authorised(bytes32 node) {
        if (!wrapper.canModifyName(node, msg.sender)) revert Unauthorised(node);
        _;
    }

    function setupDomain(bytes32 parentNode, bool active) external authorised(parentNode) {
        if (active) {
            _activateParent(parentNode);
            return;
        }

        activeParents[parentNode] = false;
        emit ParentConfigured(parentNode, false);
    }

    function registerIdentity(bytes32 parentNode, string calldata label, address newOwner) external payable nonReentrant returns (uint256 tokenId) {
        if (msg.value != 0) revert EtherNotAccepted();
        if (!activeParents[parentNode]) revert ParentNameNotActive(parentNode);
        if (newOwner == address(0)) revert InvalidOwner();

        _validateLabel(label);

        uint64 expiry = _trialExpiry(parentNode);
        _requireParentLocked(parentNode);
        _requireRegistrarAuthorised(parentNode);

        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        if (!available(node)) revert Unavailable(node);

        uint32 wrappedFuses = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;
        wrapper.setSubnodeRecord(parentNode, label, newOwner, address(0), 0, wrappedFuses, expiry);

        tokenId = uint256(node);
        _mintOrReconcile(tokenId, newOwner);
        emit IdentityRegistered(parentNode, node, newOwner, label, expiry);
    }

    function claimIdentity(bytes32 node) external nonReentrant returns (uint256 tokenId) {
        tokenId = uint256(node);
        (address wrappedOwner,, uint64 expiry) = _wrappedState(node);
        if (wrappedOwner == address(0) || expiry <= block.timestamp || wrappedOwner != msg.sender) {
            revert IdentityNotEligible(tokenId);
        }

        if (_exists(tokenId)) {
            address current = ownerOf(tokenId);
            if (current == wrappedOwner) revert IdentityAlreadyAligned(tokenId);
            _burn(tokenId);
        }

        _safeMint(wrappedOwner, tokenId);
        emit IdentityClaimed(node, wrappedOwner);
    }

    function syncIdentity(uint256 tokenId) external {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        (address wrappedOwner,, uint64 expiry) = _wrappedState(bytes32(tokenId));
        bool burnIdentity = wrappedOwner == address(0) || expiry <= block.timestamp || ownerOf(tokenId) != wrappedOwner;

        if (burnIdentity) {
            _burn(tokenId);
        }

        emit IdentitySynced(tokenId, burnIdentity, wrappedOwner, expiry);
    }

    function available(bytes32 node) public view returns (bool) {
        (, , uint64 expiry) = _wrappedState(node);
        return expiry <= block.timestamp;
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        bytes memory labelBytes = bytes(label);
        uint256 length = labelBytes.length;
        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) return false;

        for (uint256 i = 0; i < length; ) {
            bytes1 character = labelBytes[i];
            bool isNumber = character >= 0x30 && character <= 0x39;
            bool isLowerAlpha = character >= 0x61 && character <= 0x7A;
            if (!isNumber && !isLowerAlpha) return false;
            unchecked {
                ++i;
            }
        }

        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        bytes32 node = bytes32(tokenId);
        string memory tokenIdText = _toHexString(node);
        string memory ownerText = _toHexAddress(ownerOf(tokenId));

        string memory image = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360"><rect width="600" height="360" fill="#111"/>',
            '<text x="28" y="66" fill="#fff" font-size="22">ENS Identity</text>',
            '<text x="28" y="106" fill="#7ee787" font-size="16">tokenId = uint256(node)</text>',
            '<text x="28" y="146" fill="#9da7b3" font-size="13">node:</text>',
            '<text x="28" y="170" fill="#fff" font-size="12">', tokenIdText, '</text>',
            '<text x="28" y="210" fill="#9da7b3" font-size="13">owner:</text>',
            '<text x="28" y="234" fill="#fff" font-size="12">', ownerText, '</text></svg>'
        );

        string memory encodedImage = Base64.encode(bytes(image));

        string memory json = string.concat(
            '{"name":"ENS Identity #', tokenIdText,
            '","description":"Soulbound ENS-linked identity minted by FreeTrialSubdomainRegistrarIdentity.",',
            '"attributes":[{"trait_type":"Soulbound","value":"true"}],',
            '"image":"data:image/svg+xml;base64,', encodedImage, '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) public pure override {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert Soulbound();
    }

    function _activateParent(bytes32 parentNode) internal {
        _trialExpiry(parentNode);
        _requireParentLocked(parentNode);
        _requireRegistrarAuthorised(parentNode);
        activeParents[parentNode] = true;
        emit ParentConfigured(parentNode, true);
    }

    function _mintOrReconcile(uint256 tokenId, address wrappedOwner) internal {
        if (!_exists(tokenId)) {
            _safeMint(wrappedOwner, tokenId);
            return;
        }

        address current = ownerOf(tokenId);
        if (current == wrappedOwner) return;

        _burn(tokenId);
        _safeMint(wrappedOwner, tokenId);
    }

    function _trialExpiry(bytes32 parentNode) internal view returns (uint64) {
        uint64 parentExpiry = _effectiveParentExpiry(parentNode);
        uint64 nowTs = uint64(block.timestamp);
        uint64 remaining = parentExpiry - nowTs;
        uint64 duration = remaining > TRIAL_PERIOD ? TRIAL_PERIOD : remaining;
        return nowTs + duration;
    }

    function _effectiveParentExpiry(bytes32 parentNode) internal view returns (uint64 effectiveExpiry) {
        try wrapper.getData(uint256(parentNode)) returns (address, uint32 fuses, uint64 expiry) {
            effectiveExpiry = expiry;
            if ((fuses & IS_DOT_ETH) == IS_DOT_ETH) {
                if (expiry <= PARENT_GRACE_PERIOD) revert ParentExpired(parentNode);
                effectiveExpiry = expiry - PARENT_GRACE_PERIOD;
            }

            if (effectiveExpiry <= block.timestamp) revert ParentExpired(parentNode);
        } catch {
            revert ParentNotWrapped(parentNode);
        }
    }

    function _requireParentLocked(bytes32 parentNode) internal view {
        if (!wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP)) revert ParentNotLocked(parentNode);
    }

    function _requireRegistrarAuthorised(bytes32 parentNode) internal view {
        if (!wrapper.canModifyName(parentNode, address(this))) revert RegistrarNotAuthorised(parentNode);
    }

    function _validateLabel(string calldata label) internal pure {
        bytes memory labelBytes = bytes(label);
        uint256 length = labelBytes.length;

        if (length < MIN_LABEL_LENGTH) revert LabelTooShort(length);
        if (length > MAX_LABEL_LENGTH) revert LabelTooLong(length);

        for (uint256 i = 0; i < length; ) {
            bytes1 character = labelBytes[i];
            if (character == 0x2e) revert DottedLabelNotAllowed(i);

            bool isNumber = character >= 0x30 && character <= 0x39;
            bool isLowerAlpha = character >= 0x61 && character <= 0x7A;
            if (!isNumber && !isLowerAlpha) revert InvalidLabelCharacter(i, character);

            unchecked {
                ++i;
            }
        }
    }

    function _wrappedState(bytes32 node) internal view returns (address owner, uint32 fuses, uint64 expiry) {
        try wrapper.getData(uint256(node)) returns (address wrappedOwner, uint32 wrappedFuses, uint64 wrappedExpiry) {
            return (wrappedOwner, wrappedFuses, wrappedExpiry);
        } catch {
            return (address(0), 0, 0);
        }
    }

    function _toHexString(bytes32 value) internal pure returns (string memory) {
        bytes16 alphabet = 0x30313233343536373839616263646566;
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(value[i]);
            str[2 + (i * 2)] = bytes1(alphabet[b >> 4]);
            str[3 + (i * 2)] = bytes1(alphabet[b & 0x0f]);
        }
        return string(str);
    }

    function _toHexAddress(address account) internal pure returns (string memory) {
        return _toHexString(bytes32(uint256(uint160(account))));
    }
}
