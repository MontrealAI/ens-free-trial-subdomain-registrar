// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

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

error ZeroAddress();
error DependencyHasNoCode(address dependency);
error InvalidRootConfig();
error ParentNotWrapped();
error ParentExpired();
error ParentNotLocked();
error RegistrarNotAuthorised();
error RootInactive();
error InvalidLabel();
error NameUnavailable(bytes32 node);
error WrappedOwnerMismatch(address expected, address actual);
error WrappedFuseMismatch(uint32 required, uint32 actual);
error WrappedExpiryMismatch(uint64 expected, uint64 actual);
error IdentityNotEligible(uint256 tokenId);
error Soulbound();
error EtherNotAccepted();
error NonexistentToken(uint256 tokenId);

contract FreeTrialSubdomainRegistrarIdentity is ERC721, Ownable2Step, Pausable, ReentrancyGuard, IERC5192 {
    using Strings for uint256;

    string public constant ROOT_NAME = "alpha.agent.agi.eth";
    bytes32 public constant ROOT_NODE = 0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;
    uint32 public constant REQUIRED_CHILD_FUSES = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;

    // 0 available, 1 active, 2 claimable, 3 expired, 4 desynced, 5 invalid-label, 6 root-inactive, 7 parent-unusable, 8 unavailable
    uint8 internal constant STATUS_AVAILABLE = 0;
    uint8 internal constant STATUS_ACTIVE = 1;
    uint8 internal constant STATUS_CLAIMABLE = 2;
    uint8 internal constant STATUS_EXPIRED = 3;
    uint8 internal constant STATUS_DESYNCED = 4;
    uint8 internal constant STATUS_INVALID_LABEL = 5;
    uint8 internal constant STATUS_ROOT_INACTIVE = 6;
    uint8 internal constant STATUS_PARENT_UNUSABLE = 7;
    uint8 internal constant STATUS_UNAVAILABLE = 8;


    struct ParentHealthData {
        bool usable;
        bool wrapped;
        bool locked;
        bool authorised;
        uint64 effectiveExpiry;
        address owner;
    }

    struct TokenData {
        string label;
        bytes32 labelhash;
        uint64 mintedAt;
    }

    struct PreviewResult {
        bool validLabel;
        string fullName;
        string labelOut;
        bytes32 labelhash;
        bytes32 node;
        uint256 tokenId;
        bool rootActiveOut;
        bool pausedOut;
        bool parentWrapped;
        bool parentLocked;
        bool registrarAuthorised;
        bool rootUsable;
        bool availableOut;
        bool identityExists;
        bool registrable;
        bool claimable;
        address tokenOwner;
        address wrappedOwner;
        address resolver;
        uint64 currentWrappedExpiry;
        uint64 expectedNewExpiry;
        uint8 status;
    }

    INameWrapper public immutable wrapper;
    IENSRegistry public immutable ensRegistry;

    bool public rootActive;

    mapping(uint256 => TokenData) private _tokenData;

    event RootActivationSet(bool active);
    event IdentityRegistered(address indexed registrant, string label, bytes32 indexed node, uint64 expiry);
    event IdentityClaimed(address indexed owner, string label, bytes32 indexed node);
    event IdentitySynced(uint256 indexed tokenId, bool burned, address wrappedOwner, uint64 wrappedExpiry);

    constructor(address nameWrapper, address registry) ERC721("Alpha Agent Identity", "ALPHAID") {
        if (nameWrapper == address(0) || registry == address(0)) revert ZeroAddress();
        if (nameWrapper.code.length == 0) revert DependencyHasNoCode(nameWrapper);
        if (registry.code.length == 0) revert DependencyHasNoCode(registry);
        if (_namehash(ROOT_NAME) != ROOT_NODE) revert InvalidRootConfig();
        wrapper = INameWrapper(nameWrapper);
        ensRegistry = IENSRegistry(registry);
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

    function rootHealth()
        external
        view
        returns (
            string memory rootName,
            bytes32 rootNode,
            bool active,
            bool pausedOut,
            address wrapperAddress,
            address ensRegistryAddress,
            address contractOwner,
            address wrappedParentOwner,
            bool parentWrapped,
            bool parentLocked,
            bool registrarAuthorised,
            uint64 effectiveParentExpiry,
            bool rootUsable
        )
    {
                ParentHealthData memory parent = _parentHealth();
        return (
            ROOT_NAME,
            ROOT_NODE,
            rootActive,
            paused(),
            address(wrapper),
            address(ensRegistry),
            owner(),
            parent.owner,
            parent.wrapped,
            parent.locked,
            parent.authorised,
            parent.effectiveExpiry,
            parent.usable
        );
    }

    function register(string calldata label) external whenNotPaused nonReentrant returns (uint256 tokenId) {
        if (!rootActive) revert RootInactive();
        if (!_isValidLabel(label)) revert InvalidLabel();
        _requireParentReady();

        bytes32 node = nodeForLabel(label);
        tokenId = uint256(node);

        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(node);
        if (wrappedOwner != address(0) && wrappedExpiry > block.timestamp) revert NameUnavailable(node);

        uint64 expiry = _childExpiry();
        wrapper.setSubnodeRecord(ROOT_NODE, label, msg.sender, address(0), 0, REQUIRED_CHILD_FUSES, expiry);

        (address ownerAfter, uint32 fusesAfter, uint64 expiryAfter) = _wrappedState(node);
        if (ownerAfter != msg.sender) revert WrappedOwnerMismatch(msg.sender, ownerAfter);
        if ((fusesAfter & REQUIRED_CHILD_FUSES) != REQUIRED_CHILD_FUSES) {
            revert WrappedFuseMismatch(REQUIRED_CHILD_FUSES, fusesAfter);
        }
        if (expiryAfter != expiry) revert WrappedExpiryMismatch(expiry, expiryAfter);

        _mintOrRefresh(tokenId, msg.sender, label);
        emit IdentityRegistered(msg.sender, label, node, expiry);
    }

    function claimIdentity(string calldata label) external nonReentrant returns (uint256 tokenId) {
        if (!_isValidLabel(label)) revert InvalidLabel();

        bytes32 node = nodeForLabel(label);
        tokenId = uint256(node);
        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(node);

        if (wrappedOwner == address(0) || wrappedExpiry <= block.timestamp || wrappedOwner != msg.sender) {
            revert IdentityNotEligible(tokenId);
        }

        if (_exists(tokenId) && ownerOf(tokenId) == wrappedOwner) {
            return tokenId;
        }

        _mintOrRefresh(tokenId, wrappedOwner, label);
        emit IdentityClaimed(wrappedOwner, label, node);
    }

    function syncIdentity(uint256 tokenId) external returns (bool burned) {
        burned = _syncIdentity(tokenId);
    }

    function syncIdentityByLabel(string calldata label) external returns (bool burned) {
        if (!_isValidLabel(label)) revert InvalidLabel();
        uint256 tokenId = uint256(nodeForLabel(label));
        if (!_exists(tokenId)) return false;
        burned = _syncIdentity(tokenId);
    }

    function available(string calldata label) external view returns (bool) {
        if (!_isValidLabel(label)) return false;
        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(nodeForLabel(label));
        return wrappedOwner == address(0) || wrappedExpiry <= block.timestamp;
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    function nodeForLabel(string memory label) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(ROOT_NODE, keccak256(bytes(label))));
    }

    function fullNameForLabel(string memory label) public pure returns (string memory) {
        return string.concat(label, ".", ROOT_NAME);
    }

    function labelData(uint256 tokenId) external view returns (string memory label, bytes32 labelhash, uint64 mintedAt) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        TokenData memory data = _tokenData[tokenId];
        return (data.label, data.labelhash, data.mintedAt);
    }

    function preview(string calldata label) external view returns (PreviewResult memory r) {
        r.labelOut = label;
        r.validLabel = _isValidLabel(label);
        r.rootActiveOut = rootActive;
        r.pausedOut = paused();

        ParentHealthData memory parent = _parentHealth();
        r.rootUsable = parent.usable;
        r.parentWrapped = parent.wrapped;
        r.parentLocked = parent.locked;
        r.registrarAuthorised = parent.authorised;

        if (!r.validLabel) {
            r.status = STATUS_INVALID_LABEL;
            return r;
        }

        r.labelhash = keccak256(bytes(label));
        r.node = nodeForLabel(label);
        r.tokenId = uint256(r.node);
        r.fullName = fullNameForLabel(label);
        r.expectedNewExpiry = _expectedChildExpiry(parent.effectiveExpiry, r.rootUsable);

        (r.wrappedOwner, , r.currentWrappedExpiry) = _wrappedState(r.node);
        r.resolver = ensRegistry.resolver(r.node);
        r.availableOut = r.wrappedOwner == address(0) || r.currentWrappedExpiry <= block.timestamp;

        r.identityExists = _exists(r.tokenId);
        if (r.identityExists) {
            r.tokenOwner = ownerOf(r.tokenId);
        }

        r.registrable = r.validLabel && r.rootActiveOut && !r.pausedOut && r.rootUsable && r.availableOut;
        r.claimable = r.validLabel && r.wrappedOwner != address(0) && r.currentWrappedExpiry > block.timestamp && !r.identityExists;

        if (!r.rootUsable) {
            r.status = STATUS_PARENT_UNUSABLE;
        } else if (!r.rootActiveOut) {
            r.status = STATUS_ROOT_INACTIVE;
        } else if (r.wrappedOwner == address(0)) {
            r.status = STATUS_AVAILABLE;
        } else if (r.currentWrappedExpiry <= block.timestamp) {
            r.status = r.identityExists ? STATUS_EXPIRED : STATUS_AVAILABLE;
        } else if (!r.identityExists) {
            r.status = STATUS_CLAIMABLE;
        } else if (r.tokenOwner != r.wrappedOwner) {
            r.status = STATUS_DESYNCED;
        } else if (!r.availableOut) {
            r.status = STATUS_ACTIVE;
        } else {
            r.status = STATUS_UNAVAILABLE;
        }
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        TokenData memory data = _tokenData[tokenId];
        string memory fullName = fullNameForLabel(data.label);
        (address wrappedOwner, , uint64 expiry) = _wrappedState(bytes32(tokenId));
        address tokenOwner = ownerOf(tokenId);
        string memory statusText = _liveStatus(tokenOwner, wrappedOwner, expiry);
        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_svg(fullName, tokenOwner, bytes32(tokenId), tokenId, expiry, statusText)))
        );

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                fullName,
                '","description":"Soulbound identity for alpha.agent.agi.eth registrations.","image":"',
                image,
                '","attributes":[{"trait_type":"root","value":"',
                ROOT_NAME,
                '"},{"trait_type":"label","value":"',
                data.label,
                '"},{"trait_type":"soulbound","value":"true"},{"trait_type":"status","value":"',
                statusText,
                '"}],"extension":',
                _extension(tokenId, data),
                "}"
            )
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
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

    function _syncIdentity(uint256 tokenId) internal returns (bool burned) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(bytes32(tokenId));
        burned = wrappedOwner == address(0) || wrappedExpiry <= block.timestamp || ownerOf(tokenId) != wrappedOwner;
        if (burned) {
            _burnIdentity(tokenId);
        }
        emit IdentitySynced(tokenId, burned, wrappedOwner, wrappedExpiry);
    }

    function _mintOrRefresh(uint256 tokenId, address newOwner, string memory label) internal {
        if (_exists(tokenId)) {
            _burnIdentity(tokenId);
        }

        _mint(newOwner, tokenId);
        _tokenData[tokenId] = TokenData({label: label, labelhash: keccak256(bytes(label)), mintedAt: uint64(block.timestamp)});
        emit Locked(tokenId);
    }

    function _burnIdentity(uint256 tokenId) internal {
        _burn(tokenId);
        delete _tokenData[tokenId];
    }

    function _requireParentReady() internal view {
        ParentHealthData memory parent = _parentHealth();
        if (!parent.wrapped) revert ParentNotWrapped();
        if (!parent.locked) revert ParentNotLocked();
        if (!parent.authorised) revert RegistrarNotAuthorised();
        if (!parent.usable) revert ParentExpired();
    }

    function _childExpiry() internal view returns (uint64) {
        ParentHealthData memory parent = _parentHealth();
        if (!parent.usable) revert ParentExpired();
        return _expectedChildExpiry(parent.effectiveExpiry, true);
    }

    function _expectedChildExpiry(uint64 parentExpiry, bool parentUsable) internal view returns (uint64) {
        if (!parentUsable) return 0;
        uint64 trialCap = uint64(block.timestamp) + TRIAL_PERIOD;
        return parentExpiry < trialCap ? parentExpiry : trialCap;
    }

    function _parentHealth() internal view returns (ParentHealthData memory parent) {
        (address wrappedOwner, uint32 parentFuses, uint64 parentExpiry) = _wrappedState(ROOT_NODE);
        if (wrappedOwner == address(0)) {
            return parent;
        }

        parent.wrapped = true;
        parent.owner = wrappedOwner;
        parent.locked = wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP);
        parent.authorised = wrapper.canModifyName(ROOT_NODE, address(this));

        parent.effectiveExpiry = parentExpiry;
        if ((parentFuses & IS_DOT_ETH) != 0) {
            if (parentExpiry <= PARENT_GRACE_PERIOD) {
                parent.effectiveExpiry = 0;
                parent.usable = false;
                return parent;
            }
            parent.effectiveExpiry = parentExpiry - PARENT_GRACE_PERIOD;
        }

        parent.usable = parent.effectiveExpiry > block.timestamp && parent.locked && parent.authorised;
    }

    function _wrappedState(bytes32 node) internal view returns (address wrappedOwner, uint32 fuses, uint64 wrappedExpiry) {
        try wrapper.getData(uint256(node)) returns (address owner_, uint32 fuses_, uint64 expiry_) {
            return (owner_, fuses_, expiry_);
        } catch {
            return (address(0), 0, 0);
        }
    }

    function _isValidLabel(string memory label) internal pure returns (bool) {
        bytes memory chars = bytes(label);
        uint256 length = chars.length;

        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) {
            return false;
        }

        for (uint256 i = 0; i < length; ) {
            bytes1 char = chars[i];
            bool isNumber = char >= 0x30 && char <= 0x39;
            bool isLower = char >= 0x61 && char <= 0x7A;
            if (!isNumber && !isLower) {
                return false;
            }
            unchecked {
                ++i;
            }
        }

        return true;
    }

    function _liveStatus(address tokenOwner, address wrappedOwner, uint64 wrappedExpiry) internal view returns (string memory) {
        if (wrappedOwner == address(0) || wrappedExpiry <= block.timestamp) return "expired";
        if (tokenOwner != wrappedOwner) return "desynced";
        return "active";
    }

    function _extension(uint256 tokenId, TokenData memory data) internal view returns (string memory) {
        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(bytes32(tokenId));

        string memory extension = '{"parent_name":"';
        extension = string.concat(extension, ROOT_NAME);
        extension = string.concat(extension, '","parent_node":"', Strings.toHexString(uint256(ROOT_NODE), 32), '"');
        extension = string.concat(extension, ',"node":"', Strings.toHexString(tokenId, 32), '"');
        extension = string.concat(extension, ',"labelhash":"', Strings.toHexString(uint256(data.labelhash), 32), '"');
        extension = string.concat(extension, ',"token_owner":"', Strings.toHexString(ownerOf(tokenId)), '"');
        extension = string.concat(extension, ',"wrapped_owner":"', Strings.toHexString(wrappedOwner), '"');
        extension = string.concat(extension, ',"resolver":"', Strings.toHexString(ensRegistry.resolver(bytes32(tokenId))), '"');
        extension = string.concat(extension, ',"expiry_unix":', uint256(wrappedExpiry).toString());
        extension = string.concat(extension, ',"minted_at_unix":', uint256(data.mintedAt).toString());
        extension = string.concat(extension, ',"source":"onchain","ui_hint":"alpha-agent-identity"}');
        return extension;
    }

    function _svg(
        string memory fullName,
        address tokenOwner,
        bytes32 node,
        uint256 tokenId,
        uint64 wrappedExpiry,
        string memory statusText
    ) internal pure returns (string memory) {
        string memory out =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#421563"/><stop offset="100%" stop-color="#6c2ba4"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/>';
        out = string.concat(out, '<text x="40" y="70" fill="#fff" font-size="34" font-family="monospace">', fullName, '</text>');
        out = string.concat(out, '<text x="40" y="130" fill="#d8c2ef" font-size="22" font-family="monospace">root: ', ROOT_NAME, '</text>');
        out = string.concat(out, '<text x="40" y="180" fill="#d8c2ef" font-size="22" font-family="monospace">owner: ', Strings.toHexString(tokenOwner), '</text>');
        out = string.concat(out, '<text x="40" y="230" fill="#d8c2ef" font-size="22" font-family="monospace">node: ', _shortHex(node), '</text>');
        out = string.concat(out, '<text x="40" y="280" fill="#d8c2ef" font-size="22" font-family="monospace">tokenId: ', tokenId.toString(), '</text>');
        out = string.concat(out, '<text x="40" y="330" fill="#d8c2ef" font-size="22" font-family="monospace">expiry: ', uint256(wrappedExpiry).toString(), '</text>');
        out = string.concat(out, '<text x="40" y="380" fill="#ffffff" font-size="26" font-family="monospace">status: ', statusText, '</text></svg>');
        return out;
    }

    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes memory chars = bytes(name);
        bytes32 node;
        uint256 end = chars.length;

        while (end > 0) {
            uint256 start = end;
            while (start > 0 && chars[start - 1] != ".") {
                start--;
            }

            bytes memory label = new bytes(end - start);
            for (uint256 i = 0; i < label.length; i++) {
                label[i] = chars[start + i];
            }

            node = keccak256(abi.encodePacked(node, keccak256(label)));
            if (start == 0) {
                break;
            }
            end = start - 1;
        }

        return node;
    }

    function _shortHex(bytes32 value) internal pure returns (string memory) {
        string memory full = Strings.toHexString(uint256(value), 32);
        bytes memory fullBytes = bytes(full);
        bytes memory out = new bytes(15);

        out[0] = fullBytes[0];
        out[1] = fullBytes[1];
        for (uint256 i = 0; i < 6; i++) {
            out[2 + i] = fullBytes[2 + i];
            out[9 + i] = fullBytes[fullBytes.length - 6 + i];
        }
        out[8] = ".";

        return string(out);
    }
}
