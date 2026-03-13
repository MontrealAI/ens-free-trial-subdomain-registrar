// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

uint32 constant CANNOT_UNWRAP = 1;
uint32 constant CANNOT_TRANSFER = 1 << 2;
uint32 constant PARENT_CANNOT_CONTROL = 1 << 16;
uint32 constant IS_DOT_ETH = 1 << 17;

interface INameWrapperIdentity is IERC1155 {
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

error Unauthorised(bytes32 node);
error ParentNotWrapped(bytes32 parentNode);
error ParentNameNotActive(bytes32 parentNode);
error ParentNotLocked(bytes32 parentNode);
error RegistrarNotAuthorised(bytes32 parentNode);
error ParentExpired(bytes32 parentNode);
error Unavailable(bytes32 node);
error LabelTooShort(uint256 length);
error LabelTooLong(uint256 length);
error DottedLabelNotAllowed(uint256 index);
error InvalidLabelCharacter(uint256 index, bytes1 character);
error EtherNotAccepted();
error InvalidWrapper();
error InvalidRegistry();
error Soulbound();
error InvalidOwner();
error IdentityAlreadyMinted(uint256 tokenId);
error IdentityNotFound(uint256 tokenId);
error NotWrappedOwner(bytes32 node);

contract FreeTrialSubdomainRegistrarIdentity is ReentrancyGuard {
    using Address for address;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    string public constant name = "ENS Wrapped Identity";
    string public constant symbol = "ENSID";

    INameWrapperIdentity public immutable wrapper;
    address public immutable ensRegistry;
    mapping(bytes32 => bool) public activeParents;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    event ParentConfigured(bytes32 indexed parentNode, bool active);
    event NameRegistered(bytes32 indexed parentNode, bytes32 indexed node, address indexed owner, string label, uint64 expiry);
    event IdentityClaimed(bytes32 indexed node, uint256 indexed tokenId, address indexed owner);
    event IdentitySynced(bytes32 indexed node, uint256 indexed tokenId, bool burned, string reason);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address wrapper_, address ensRegistry_) {
        if (wrapper_ == address(0)) revert InvalidWrapper();
        if (ensRegistry_ == address(0)) revert InvalidRegistry();
        wrapper = INameWrapperIdentity(wrapper_);
        ensRegistry = ensRegistry_;
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

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0xb45a3c0e;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidOwner();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert IdentityNotFound(tokenId);
        return owner;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        address owner = ownerOf(tokenId);
        bytes32 node = bytes32(tokenId);
        (, , uint64 expiry) = wrapper.getData(tokenId);

        string memory label = Strings.toHexString(uint256(node), 32);
        string memory image = Base64.encode(
            bytes(
                string.concat(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#111827"/>',
                    '<text x="20" y="120" fill="#f9fafb" font-size="18">ENS Identity</text>',
                    '<text x="20" y="180" fill="#9ca3af" font-size="14">Node: ',
                    label,
                    '</text><text x="20" y="220" fill="#9ca3af" font-size="14">Owner: ',
                    Strings.toHexString(owner),
                    '</text><text x="20" y="260" fill="#9ca3af" font-size="14">Expiry: ',
                    Strings.toString(expiry),
                    '</text></svg>'
                )
            )
        );

        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"ENS Identity #',
                    Strings.toString(tokenId),
                    '","description":"Soulbound ENS-wrapped identity token linked to NameWrapper ownership.","image":"data:image/svg+xml;base64,',
                    image,
                    '","attributes":[{"trait_type":"node","value":"',
                    label,
                    '"}]}'
                )
            )
        );

        return string.concat("data:application/json;base64,", json);
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function setupDomain(bytes32 parentNode, bool active) external authorised(parentNode) {
        if (active) {
            _activateParent(parentNode);
            return;
        }
        activeParents[parentNode] = false;
        emit ParentConfigured(parentNode, false);
    }

    function registerIdentity(bytes32 parentNode, string calldata label) external payable nonReentrant returns (uint256 tokenId) {
        if (msg.value != 0) revert EtherNotAccepted();
        if (!activeParents[parentNode]) revert ParentNameNotActive(parentNode);

        _validateLabel(label);
        uint64 expiry = _trialExpiry(parentNode);
        _requireParentLocked(parentNode);
        _requireRegistrarAuthorised(parentNode);

        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        if (!available(node)) revert Unavailable(node);

        uint32 wrappedFuses = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;
        wrapper.setSubnodeRecord(parentNode, label, msg.sender, address(0), 0, wrappedFuses, expiry);

        tokenId = uint256(node);
        _mint(msg.sender, tokenId);

        emit NameRegistered(parentNode, node, msg.sender, label, expiry);
        emit IdentityClaimed(node, tokenId, msg.sender);
    }

    function claimIdentity(bytes32 node) external nonReentrant returns (uint256 tokenId) {
        (address wrappedOwner, , uint64 expiry) = _wrappedData(node);
        if (wrappedOwner != msg.sender) revert NotWrappedOwner(node);
        if (expiry <= block.timestamp) revert ParentExpired(node);

        tokenId = uint256(node);
        if (_owners[tokenId] != address(0)) revert IdentityAlreadyMinted(tokenId);

        _mint(msg.sender, tokenId);
        emit IdentityClaimed(node, tokenId, msg.sender);
    }

    function syncIdentity(uint256 tokenId) external returns (bool burned) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert IdentityNotFound(tokenId);

        bytes32 node = bytes32(tokenId);
        try wrapper.getData(tokenId) returns (address wrappedOwner, uint32, uint64 expiry) {
            if (expiry <= block.timestamp) {
                _burn(tokenId, tokenOwner);
                emit IdentitySynced(node, tokenId, true, "expired");
                return true;
            }

            if (wrappedOwner != tokenOwner) {
                _burn(tokenId, tokenOwner);
                emit IdentitySynced(node, tokenId, true, "desynced");
                return true;
            }

            emit IdentitySynced(node, tokenId, false, "in-sync");
            return false;
        } catch {
            _burn(tokenId, tokenOwner);
            emit IdentitySynced(node, tokenId, true, "unwrapped");
            return true;
        }
    }

    function available(bytes32 node) public view returns (bool) {
        try wrapper.getData(uint256(node)) returns (address, uint32, uint64 expiry) {
            return expiry <= block.timestamp;
        } catch {
            return true;
        }
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 length = b.length;
        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) return false;

        for (uint256 i = 0; i < length; ++i) {
            bytes1 c = b[i];
            bool isNum = c >= 0x30 && c <= 0x39;
            bool isLower = c >= 0x61 && c <= 0x7A;
            if (!isNum && !isLower) return false;
        }
        return true;
    }

    function _activateParent(bytes32 parentNode) internal {
        _trialExpiry(parentNode);
        _requireParentLocked(parentNode);
        _requireRegistrarAuthorised(parentNode);

        activeParents[parentNode] = true;
        emit ParentConfigured(parentNode, true);
    }

    function _mint(address to, uint256 tokenId) internal {
        if (to == address(0)) revert InvalidOwner();
        if (_owners[tokenId] != address(0)) revert IdentityAlreadyMinted(tokenId);

        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId, address owner) internal {
        delete _owners[tokenId];
        _balances[owner] -= 1;
        emit Transfer(owner, address(0), tokenId);
    }

    function _wrappedData(bytes32 node) internal view returns (address owner, uint32 fuses, uint64 expiry) {
        try wrapper.getData(uint256(node)) returns (address owner_, uint32 fuses_, uint64 expiry_) {
            return (owner_, fuses_, expiry_);
        } catch {
            revert ParentNotWrapped(node);
        }
    }

    function _trialExpiry(bytes32 parentNode) internal view returns (uint64) {
        uint64 parentExpiry = _effectiveParentExpiry(parentNode);
        uint64 nowTs = uint64(block.timestamp);
        uint64 remaining = parentExpiry - nowTs;
        uint64 duration = remaining > TRIAL_PERIOD ? TRIAL_PERIOD : remaining;
        return nowTs + duration;
    }

    function _effectiveParentExpiry(bytes32 parentNode) internal view returns (uint64 effectiveExpiry) {
        (, uint32 fuses, uint64 expiry) = _wrappedData(parentNode);
        effectiveExpiry = expiry;

        if ((fuses & IS_DOT_ETH) == IS_DOT_ETH) {
            if (expiry <= PARENT_GRACE_PERIOD) revert ParentExpired(parentNode);
            effectiveExpiry = expiry - PARENT_GRACE_PERIOD;
        }

        if (effectiveExpiry <= block.timestamp) revert ParentExpired(parentNode);
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
}
