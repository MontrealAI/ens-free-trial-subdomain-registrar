// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

uint32 constant CANNOT_UNWRAP = 1;
uint32 constant CANNOT_TRANSFER = 1 << 2;
uint32 constant PARENT_CANNOT_CONTROL = 1 << 16;
uint32 constant IS_DOT_ETH = 1 << 17;

interface INameWrapper {
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

interface IENSRegistry {
    function resolver(bytes32 node) external view returns (address);
}

interface IERC5192 {
    event Locked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

error InvalidAddress();
error InvalidParentName();
error InvalidParentNode();
error ParentNotWrapped();
error ParentExpired();
error ParentNotLocked();
error RegistrarNotAuthorised();
error RootInactive();
error LabelTooShort(uint256 length);
error LabelTooLong(uint256 length);
error InvalidLabelCharacter(uint256 index, bytes1 character);
error NameUnavailable(bytes32 node);
error WrappedOwnerMismatch(address expected, address actual);
error IdentityNotEligible(uint256 tokenId);
error IdentityAlreadyAligned(uint256 tokenId);
error Soulbound();
error EtherNotAccepted();
error NonexistentToken(uint256 tokenId);

contract FreeTrialSubdomainRegistrarIdentity is ERC721, Ownable2Step, Pausable, ReentrancyGuard, IERC5192 {
    using Strings for uint256;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    INameWrapper public immutable wrapper;
    IENSRegistry public immutable ensRegistry;
    bytes32 public immutable parentNode;
    string public parentName;

    bool public rootActive;

    mapping(uint256 => uint64) public mintedAt;
    mapping(uint256 => string) private _tokenLabels;

    event RootActivationSet(bool active);
    event IdentityRegistered(address indexed registrant, string label, bytes32 indexed node, uint64 expiry);
    event IdentityClaimed(address indexed owner, string label, bytes32 indexed node);
    event IdentitySynced(uint256 indexed tokenId, bool burned, address wrappedOwner, uint64 wrappedExpiry);

    constructor(address nameWrapper, address registry, bytes32 configuredParentNode, string memory configuredParentName)
        ERC721("Alpha Agent Identity", "AAI")
    {
        if (nameWrapper == address(0) || registry == address(0)) revert InvalidAddress();
        if (configuredParentNode == bytes32(0)) revert InvalidParentNode();

        string memory normalizedParent = _toLower(configuredParentName);
        if (bytes(normalizedParent).length == 0) revert InvalidParentName();
        if (_namehash(normalizedParent) != configuredParentNode) revert InvalidParentNode();

        wrapper = INameWrapper(nameWrapper);
        ensRegistry = IENSRegistry(registry);
        parentNode = configuredParentNode;
        parentName = normalizedParent;
    }

    receive() external payable {
        revert EtherNotAccepted();
    }

    fallback() external payable {
        revert EtherNotAccepted();
    }

    function setRootActive(bool active) external onlyOwner {
        if (active) {
            _requireParentReady();
        }
        rootActive = active;
        emit RootActivationSet(active);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function register(string calldata label) external whenNotPaused nonReentrant returns (uint256 tokenId) {
        if (!rootActive) revert RootInactive();
        _validateLabel(label);
        _requireParentReady();

        bytes32 node = _nodeForLabel(label);
        (address wrappedOwner,, uint64 wrappedExpiry) = _wrappedState(node);
        if (wrappedOwner != address(0) && wrappedExpiry > block.timestamp) revert NameUnavailable(node);

        uint64 expiry = _childExpiry();
        uint32 childFuses = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;
        wrapper.setSubnodeRecord(parentNode, label, msg.sender, address(0), 0, childFuses, expiry);

        (address ownerAfter,,) = _wrappedState(node);
        if (ownerAfter != msg.sender) revert WrappedOwnerMismatch(msg.sender, ownerAfter);

        tokenId = uint256(node);
        _mintOrAlign(tokenId, msg.sender, label);

        emit IdentityRegistered(msg.sender, label, node, expiry);
    }

    function claimIdentity(string calldata label) external nonReentrant returns (uint256 tokenId) {
        _validateLabel(label);
        bytes32 node = _nodeForLabel(label);
        tokenId = uint256(node);

        (address wrappedOwner,, uint64 expiry) = _wrappedState(node);
        if (wrappedOwner == address(0) || expiry <= block.timestamp || wrappedOwner != msg.sender) {
            revert IdentityNotEligible(tokenId);
        }

        if (_exists(tokenId) && ownerOf(tokenId) == wrappedOwner) {
            revert IdentityAlreadyAligned(tokenId);
        }

        _mintOrAlign(tokenId, wrappedOwner, label);
        emit IdentityClaimed(wrappedOwner, label, node);
    }

    function syncIdentity(uint256 tokenId) external {
        _syncIdentity(tokenId);
    }

    function syncIdentityByLabel(string calldata label) external {
        _validateLabel(label);
        _syncIdentity(uint256(_nodeForLabel(label)));
    }

    function available(string calldata label) external view returns (bool) {
        _validateLabel(label);
        (, , uint64 expiry) = _wrappedState(_nodeForLabel(label));
        return expiry <= block.timestamp;
    }

    function preview(string calldata label)
        external
        view
        returns (
            string memory fullName,
            bytes32 node,
            uint256 tokenId,
            uint64 expectedExpiry,
            bool isAvailable,
            address wrappedOwner,
            address resolver,
            bool active
        )
    {
        _validateLabel(label);
        node = _nodeForLabel(label);
        tokenId = uint256(node);
        uint64 wrappedExpiry;
        (wrappedOwner,, wrappedExpiry) = _wrappedState(node);
        expectedExpiry = _previewChildExpiry();
        isAvailable = wrappedExpiry <= block.timestamp;
        resolver = ensRegistry.resolver(node);
        active = rootActive;
        fullName = _fullName(label);
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 length = b.length;
        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) return false;

        for (uint256 i = 0; i < length; ) {
            bytes1 char = b[i];
            bool isNumber = char >= 0x30 && char <= 0x39;
            bool isLower = char >= 0x61 && char <= 0x7a;
            if (!isNumber && !isLower) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        string memory label = _tokenLabels[tokenId];
        string memory fullName = _fullName(label);
        string memory json = string(abi.encodePacked('{"name":"', fullName, '","description":"Soulbound ENS-linked identity","image":"data:image/svg+xml;base64,', Base64.encode(bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#4b1f75"/></svg>')), '","attributes":[],"extension":', _extensionForToken(tokenId), '}'));
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _extensionForToken(uint256 tokenId) internal view returns (string memory) {
        bytes32 node = bytes32(tokenId);
        string memory label = _tokenLabels[tokenId];
        (, , uint64 expiry) = _wrappedState(node);

        string memory out = string.concat('{"parent_node":"', Strings.toHexString(uint256(parentNode), 32));
        out = string.concat(out, '","node":"', Strings.toHexString(uint256(node), 32));
        out = string.concat(out, '","labelhash":"', Strings.toHexString(uint256(keccak256(bytes(label))), 32));
        out = string.concat(out, '","owner":"', Strings.toHexString(ownerOf(tokenId)));
        out = string.concat(out, '","resolver":"', Strings.toHexString(ensRegistry.resolver(node)));
        out = string.concat(out, '","expiry_unix":', uint256(expiry).toString());
        out = string.concat(out, ',"minted_at_unix":', uint256(mintedAt[tokenId]).toString());
        return string.concat(out, ',"source":"onchain","ui_hint":"alpha-agent-identity"}');
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


    function _syncIdentity(uint256 tokenId) internal {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        (address wrappedOwner,, uint64 expiry) = _wrappedState(bytes32(tokenId));
        bool burnIdentity = wrappedOwner == address(0) || expiry <= block.timestamp || ownerOf(tokenId) != wrappedOwner;

        if (burnIdentity) {
            _burnIdentity(tokenId);
        }

        emit IdentitySynced(tokenId, burnIdentity, wrappedOwner, expiry);
    }

    function _mintOrAlign(uint256 tokenId, address owner, string memory label) internal {
        if (_exists(tokenId)) {
            _burnIdentity(tokenId);
        }
        _mint(owner, tokenId);
        mintedAt[tokenId] = uint64(block.timestamp);
        _tokenLabels[tokenId] = label;
        emit Locked(tokenId);
    }

    function _burnIdentity(uint256 tokenId) internal {
        _burn(tokenId);
        delete mintedAt[tokenId];
        delete _tokenLabels[tokenId];
    }

    function _requireParentReady() internal view {
        _effectiveParentExpiry();
        if (!wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP)) revert ParentNotLocked();
        if (!wrapper.canModifyName(parentNode, address(this))) revert RegistrarNotAuthorised();
    }

    function _previewChildExpiry() internal view returns (uint64) {
        try this.previewChildExpiry() returns (uint64 expiry) {
            return expiry;
        } catch {
            return 0;
        }
    }

    function previewChildExpiry() external view returns (uint64) {
        uint64 cap = _effectiveParentExpiry();
        uint64 nowTs = uint64(block.timestamp);
        uint64 trialCap = nowTs + TRIAL_PERIOD;
        return cap < trialCap ? cap : trialCap;
    }

    function _childExpiry() internal view returns (uint64) {
        uint64 cap = _effectiveParentExpiry();
        uint64 nowTs = uint64(block.timestamp);
        uint64 trialCap = nowTs + TRIAL_PERIOD;
        return cap < trialCap ? cap : trialCap;
    }

    function _effectiveParentExpiry() internal view returns (uint64) {
        (address owner, uint32 fuses, uint64 expiry) = _wrappedState(parentNode);
        if (owner == address(0)) revert ParentNotWrapped();
        uint64 effectiveExpiry = expiry;
        if ((fuses & IS_DOT_ETH) != 0) {
            if (expiry <= PARENT_GRACE_PERIOD) revert ParentExpired();
            effectiveExpiry = expiry - PARENT_GRACE_PERIOD;
        }
        if (effectiveExpiry <= block.timestamp) revert ParentExpired();
        return effectiveExpiry;
    }

    function _wrappedState(bytes32 node) internal view returns (address owner, uint32 fuses, uint64 expiry) {
        try wrapper.getData(uint256(node)) returns (address wrappedOwner, uint32 wrappedFuses, uint64 wrappedExpiry) {
            return (wrappedOwner, wrappedFuses, wrappedExpiry);
        } catch {
            return (address(0), 0, 0);
        }
    }

    function _nodeForLabel(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }

    function _fullName(string memory label) internal view returns (string memory) {
        return string.concat(label, ".", parentName);
    }

    function _validateLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        uint256 length = b.length;
        if (length < MIN_LABEL_LENGTH) revert LabelTooShort(length);
        if (length > MAX_LABEL_LENGTH) revert LabelTooLong(length);

        for (uint256 i = 0; i < length; ) {
            bytes1 char = b[i];
            bool isNumber = char >= 0x30 && char <= 0x39;
            bool isLower = char >= 0x61 && char <= 0x7a;
            if (!isNumber && !isLower) revert InvalidLabelCharacter(i, char);
            unchecked {
                ++i;
            }
        }
    }

    function _toLower(string memory value) internal pure returns (string memory) {
        bytes memory b = bytes(value);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                b[i] = bytes1(uint8(b[i]) + 32);
            }
        }
        return string(b);
    }

    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes memory b = bytes(name);
        bytes32 node;
        uint256 end = b.length;

        while (end > 0) {
            uint256 start = end;
            while (start > 0 && b[start - 1] != ".") {
                start--;
            }

            bytes memory label = new bytes(end - start);
            for (uint256 i = 0; i < label.length; i++) {
                label[i] = b[start + i];
            }

            node = keccak256(abi.encodePacked(node, keccak256(label)));
            if (start == 0) break;
            end = start - 1;
        }

        return node;
    }

    function _shortHex(bytes32 value) internal pure returns (string memory) {
        string memory full = Strings.toHexString(uint256(value), 32);
        bytes memory b = bytes(full);
        bytes memory out = new bytes(15);
        out[0] = b[0];
        out[1] = b[1];
        for (uint256 i = 0; i < 6; i++) {
            out[i + 2] = b[i + 2];
            out[i + 9] = b[b.length - 6 + i];
        }
        out[8] = ".";
        return string(out);
    }
}
