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
error InvalidRootConfig();
error ParentNotWrapped();
error ParentExpired();
error ParentNotLocked();
error RegistrarNotAuthorised();
error RootInactive();
error InvalidLabel();
error NameUnavailable(bytes32 node);
error WrappedOwnerMismatch(address expected, address actual);
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

    // 0: active, 1: expired, 2: desynced, 3: unavailable, 4: invalid-label, 5: root-inactive, 6: parent-unusable
    uint8 internal constant STATUS_ACTIVE = 0;
    uint8 internal constant STATUS_EXPIRED = 1;
    uint8 internal constant STATUS_DESYNCED = 2;
    uint8 internal constant STATUS_UNAVAILABLE = 3;
    uint8 internal constant STATUS_INVALID_LABEL = 4;
    uint8 internal constant STATUS_ROOT_INACTIVE = 5;
    uint8 internal constant STATUS_PARENT_UNUSABLE = 6;

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
        bool parentLocked;
        bool registrarAuthorised;
        bool availableOut;
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
        if (nameWrapper == address(0) || registry == address(0)) revert InvalidAddress();
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
        if (active) _requireParentReady();
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
        if (!_isValidLabel(label)) revert InvalidLabel();
        _requireParentReady();

        bytes32 node = _nodeForLabel(label);
        (address wrappedOwner, , uint64 wrappedExpiry) = _wrappedState(node);
        if (wrappedOwner != address(0) && wrappedExpiry > block.timestamp) revert NameUnavailable(node);

        uint64 expiry = _childExpiry();
        wrapper.setSubnodeRecord(
            ROOT_NODE,
            label,
            msg.sender,
            address(0),
            0,
            CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL,
            expiry
        );

        (address ownerAfter, , ) = _wrappedState(node);
        if (ownerAfter != msg.sender) revert WrappedOwnerMismatch(msg.sender, ownerAfter);

        tokenId = uint256(node);
        _mintOrRefresh(tokenId, msg.sender, label);

        emit IdentityRegistered(msg.sender, label, node, expiry);
    }

    function claimIdentity(string calldata label) external nonReentrant returns (uint256 tokenId) {
        if (!_isValidLabel(label)) revert InvalidLabel();
        bytes32 node = _nodeForLabel(label);
        tokenId = uint256(node);

        (address wrappedOwner, , uint64 expiry) = _wrappedState(node);
        if (wrappedOwner == address(0) || expiry <= block.timestamp || wrappedOwner != msg.sender) {
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
        if (!_isValidLabel(label)) return false;
        burned = _syncIdentity(uint256(_nodeForLabel(label)));
    }

    function available(string calldata label) external view returns (bool) {
        if (!_isValidLabel(label)) return false;
        (address wrappedOwner, , uint64 expiry) = _wrappedState(_nodeForLabel(label));
        return wrappedOwner == address(0) || expiry <= block.timestamp;
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    function preview(string calldata label) external view returns (PreviewResult memory r) {
        r.labelOut = label;
        r.validLabel = _isValidLabel(label);
        r.rootActiveOut = rootActive;
        r.pausedOut = paused();

        (bool parentUsable, bool lockedOut, bool authorisedOut, uint64 parentExpiry) = _parentHealth();
        r.parentLocked = lockedOut;
        r.registrarAuthorised = authorisedOut;

        if (!r.validLabel) {
            r.status = STATUS_INVALID_LABEL;
            return r;
        }

        r.labelhash = keccak256(bytes(label));
        r.node = keccak256(abi.encodePacked(ROOT_NODE, r.labelhash));
        r.tokenId = uint256(r.node);
        r.fullName = _fullName(label);

        (r.wrappedOwner, , r.currentWrappedExpiry) = _wrappedState(r.node);
        r.resolver = ensRegistry.resolver(r.node);
        r.expectedNewExpiry = _expectedChildExpiry(parentExpiry, parentUsable);
        r.availableOut = r.wrappedOwner == address(0) || r.currentWrappedExpiry <= block.timestamp;

        if (!parentUsable) r.status = STATUS_PARENT_UNUSABLE;
        else if (!r.rootActiveOut) r.status = STATUS_ROOT_INACTIVE;
        else if (r.wrappedOwner == address(0) || r.currentWrappedExpiry <= block.timestamp) r.status = STATUS_EXPIRED;
        else if (_exists(r.tokenId) && ownerOf(r.tokenId) != r.wrappedOwner) r.status = STATUS_DESYNCED;
        else if (_exists(r.tokenId) && ownerOf(r.tokenId) == r.wrappedOwner) r.status = STATUS_ACTIVE;
        else r.status = STATUS_UNAVAILABLE;
    }

    function rootInfo()
        external
        view
        returns (
            string memory rootName,
            bytes32 rootNode,
            bool active,
            bool pausedOut,
            address wrapperAddress,
            address ensRegistryAddress,
            address contractOwner
        )
    {
        return (ROOT_NAME, ROOT_NODE, rootActive, paused(), address(wrapper), address(ensRegistry), owner());
    }

    function labelData(uint256 tokenId) external view returns (string memory label, bytes32 labelhash, uint64 mintedAt) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        TokenData memory data = _tokenData[tokenId];
        return (data.label, data.labelhash, data.mintedAt);
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken(tokenId);

        TokenData memory data = _tokenData[tokenId];
        string memory fullName = _fullName(data.label);
        bytes32 node = bytes32(tokenId);
        (address wrappedOwner, , uint64 expiry) = _wrappedState(node);
        address tokenOwner = ownerOf(tokenId);
        string memory statusText = _liveStatus(tokenOwner, wrappedOwner, expiry);

        string memory svg = _svg(fullName, tokenOwner, node, tokenId, expiry, statusText);
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));

        string memory json = '{"name":"';
        json = string.concat(json, fullName);
        json = string.concat(json, '","description":"Soulbound identity for alpha.agent.agi.eth registrations.","image":"');
        json = string.concat(json, image);
        json = string.concat(json, '","attributes":[');
        json = string.concat(json, '{"trait_type":"root","value":"', ROOT_NAME, '"},');
        json = string.concat(json, '{"trait_type":"label","value":"', data.label, '"},');
        json = string.concat(json, '{"trait_type":"soulbound","value":"true"},');
        json = string.concat(json, '{"trait_type":"status","value":"', statusText, '"}],"extension":');
        json = string.concat(json, _extension(tokenId, data));
        json = string.concat(json, "}");

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

        (address wrappedOwner, , uint64 expiry) = _wrappedState(bytes32(tokenId));
        burned = wrappedOwner == address(0) || expiry <= block.timestamp || ownerOf(tokenId) != wrappedOwner;
        if (burned) _burnIdentity(tokenId);

        emit IdentitySynced(tokenId, burned, wrappedOwner, expiry);
    }

    function _mintOrRefresh(uint256 tokenId, address newOwner, string memory label) internal {
        if (_exists(tokenId)) _burnIdentity(tokenId);
        _mint(newOwner, tokenId);
        _tokenData[tokenId] = TokenData({label: label, labelhash: keccak256(bytes(label)), mintedAt: uint64(block.timestamp)});
        emit Locked(tokenId);
    }

    function _burnIdentity(uint256 tokenId) internal {
        _burn(tokenId);
        delete _tokenData[tokenId];
    }

    function _requireParentReady() internal view {
        (address wrappedOwner, uint32 fuses, uint64 expiry) = _wrappedState(ROOT_NODE);
        if (wrappedOwner == address(0)) revert ParentNotWrapped();

        uint64 effectiveExpiry = expiry;
        if ((fuses & IS_DOT_ETH) != 0) {
            if (expiry <= PARENT_GRACE_PERIOD) revert ParentExpired();
            effectiveExpiry = expiry - PARENT_GRACE_PERIOD;
        }
        if (effectiveExpiry <= block.timestamp) revert ParentExpired();

        if (!wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP)) revert ParentNotLocked();
        if (!wrapper.canModifyName(ROOT_NODE, address(this))) revert RegistrarNotAuthorised();
    }

    function _childExpiry() internal view returns (uint64) {
        (bool parentUsable, , , uint64 parentExpiry) = _parentHealth();
        if (!parentUsable) revert ParentExpired();
        return _expectedChildExpiry(parentExpiry, true);
    }

    function _expectedChildExpiry(uint64 parentExpiry, bool parentUsable) internal view returns (uint64) {
        if (!parentUsable) return 0;
        uint64 trialCap = uint64(block.timestamp) + TRIAL_PERIOD;
        return parentExpiry < trialCap ? parentExpiry : trialCap;
    }

    function _parentHealth() internal view returns (bool usable, bool parentLockedOut, bool registrarAuthorisedOut, uint64 effectiveExpiry) {
        (address owner, uint32 fuses, uint64 expiry) = _wrappedState(ROOT_NODE);
        if (owner == address(0)) return (false, false, false, 0);

        parentLockedOut = wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP);
        registrarAuthorisedOut = wrapper.canModifyName(ROOT_NODE, address(this));

        effectiveExpiry = expiry;
        if ((fuses & IS_DOT_ETH) != 0) {
            if (expiry <= PARENT_GRACE_PERIOD) return (false, parentLockedOut, registrarAuthorisedOut, 0);
            effectiveExpiry = expiry - PARENT_GRACE_PERIOD;
        }

        usable = effectiveExpiry > block.timestamp;
    }

    function _wrappedState(bytes32 node) internal view returns (address owner, uint32 fuses, uint64 expiry) {
        try wrapper.getData(uint256(node)) returns (address wrappedOwner, uint32 wrappedFuses, uint64 wrappedExpiry) {
            return (wrappedOwner, wrappedFuses, wrappedExpiry);
        } catch {
            return (address(0), 0, 0);
        }
    }

    function _nodeForLabel(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ROOT_NODE, keccak256(bytes(label))));
    }

    function _fullName(string memory label) internal pure returns (string memory) {
        return string.concat(label, ".", ROOT_NAME);
    }

    function _isValidLabel(string memory label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 length = b.length;
        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) return false;

        for (uint256 i = 0; i < length; ) {
            bytes1 char = b[i];
            bool isNumber = char >= 0x30 && char <= 0x39;
            bool isLower = char >= 0x61 && char <= 0x7A;
            if (!isNumber && !isLower) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function _liveStatus(address tokenOwner, address wrappedOwner, uint64 expiry) internal view returns (string memory) {
        if (wrappedOwner == address(0) || expiry <= block.timestamp) return "expired";
        if (tokenOwner != wrappedOwner) return "desynced";
        return "active";
    }

    function _extension(uint256 tokenId, TokenData memory data) internal view returns (string memory) {
        string memory out = '{"parent_name":"';
        out = string.concat(out, ROOT_NAME);
        out = string.concat(out, '","parent_node":"', Strings.toHexString(uint256(ROOT_NODE), 32), '"');
        out = string.concat(out, ',"node":"', Strings.toHexString(tokenId, 32), '"');
        out = string.concat(out, ',"labelhash":"', Strings.toHexString(uint256(data.labelhash), 32), '"');
        out = string.concat(out, ',"token_owner":"', Strings.toHexString(ownerOf(tokenId)), '"');
        (address wrappedOwner, , uint64 expiry) = _wrappedState(bytes32(tokenId));
        out = string.concat(out, ',\"wrapped_owner\":\"', Strings.toHexString(wrappedOwner), '\"');
        out = string.concat(out, ',\"resolver\":\"', Strings.toHexString(ensRegistry.resolver(bytes32(tokenId))), '\"');
        out = string.concat(out, ',"expiry_unix":', uint256(expiry).toString());
        out = string.concat(out, ',"minted_at_unix":', uint256(data.mintedAt).toString());
        out = string.concat(out, ',"source":"onchain","ui_hint":"alpha-agent-identity"}');
        return out;
    }

    function _svg(
        string memory fullName,
        address tokenOwner,
        bytes32 node,
        uint256 tokenId,
        uint64 expiry,
        string memory statusText
    ) internal pure returns (string memory) {
        string memory out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#4b1f75"/>';
        out = string.concat(out, '<text x="40" y="70" fill="#fff" font-size="34" font-family="monospace">', fullName, '</text>');
        out = string.concat(out, '<text x="40" y="130" fill="#d8c2ef" font-size="22" font-family="monospace">root: ', ROOT_NAME, '</text>');
        out = string.concat(out, '<text x="40" y="180" fill="#d8c2ef" font-size="22" font-family="monospace">owner: ', Strings.toHexString(tokenOwner), '</text>');
        out = string.concat(out, '<text x="40" y="230" fill="#d8c2ef" font-size="22" font-family="monospace">node: ', _shortHex(node), '</text>');
        out = string.concat(out, '<text x="40" y="280" fill="#d8c2ef" font-size="22" font-family="monospace">tokenId: ', tokenId.toString(), '</text>');
        out = string.concat(out, '<text x="40" y="330" fill="#d8c2ef" font-size="22" font-family="monospace">expiry: ', uint256(expiry).toString(), '</text>');
        out = string.concat(out, '<text x="40" y="380" fill="#ffffff" font-size="26" font-family="monospace">status: ', statusText, '</text></svg>');
        return out;
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
