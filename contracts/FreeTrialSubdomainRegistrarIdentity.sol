// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
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

error LabelTooShort(uint256 length);
error LabelTooLong(uint256 length);
error InvalidLabelCharacter(uint256 index, bytes1 character);
error RootNotActive();
error ParentNotWrapped(bytes32 node);
error ParentNotLocked(bytes32 node);
error ParentExpired(bytes32 node);
error RegistrarNotAuthorised(bytes32 node);
error Unavailable(bytes32 node);
error EtherNotAccepted();
error Soulbound();
error InvalidRecipient();
error InvalidParentName();
error InvalidNode();
error ChildOwnerMismatch(address expected, address actual);
error IdentityNotEligible(uint256 tokenId);
error IdentityAlreadyAligned(uint256 tokenId);
error NonexistentToken(uint256 tokenId);

contract FreeTrialSubdomainRegistrarIdentity is ERC721, Ownable2Step, Pausable, IERC5192 {
    using Strings for uint256;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint32 public constant CHILD_FUSES = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    INameWrapper public immutable nameWrapper;
    IENSRegistry public immutable ensRegistry;
    bytes32 public immutable parentNode;
    string public parentName;
    bool public rootActive;

    struct IdentityData {
        string label;
        uint64 mintedAt;
    }

    mapping(uint256 => IdentityData) public identityData;

    event RootActivationSet(bool active);
    event IdentityRegistered(address indexed registrant, address indexed recipient, string indexed label, bytes32 node, uint64 expiry);
    event IdentityClaimed(address indexed claimer, string indexed label, bytes32 node);
    event IdentitySynced(uint256 indexed tokenId, bool burned, address wrappedOwner, uint64 wrappedExpiry);

    constructor(address wrapper_, address ensRegistry_, bytes32 parentNode_, string memory parentName_)
        ERC721("Alpha Agent Identity", "ALPHAID")
    {
        if (wrapper_ == address(0) || ensRegistry_ == address(0)) revert InvalidRecipient();
        if (bytes(parentName_).length == 0) revert InvalidParentName();
        if (namehash(parentName_) != parentNode_) revert InvalidParentName();

        nameWrapper = INameWrapper(wrapper_);
        ensRegistry = IENSRegistry(ensRegistry_);
        parentNode = parentNode_;
        parentName = parentName_;
    }

    receive() external payable {
        revert EtherNotAccepted();
    }

    fallback() external payable {
        revert EtherNotAccepted();
    }

    function activateRoot() external onlyOwner {
        _assertRootReady();
        rootActive = true;
        emit RootActivationSet(true);
    }

    function deactivateRoot() external onlyOwner {
        rootActive = false;
        emit RootActivationSet(false);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function register(string calldata label) external whenNotPaused returns (uint256 tokenId) {
        if (!rootActive) revert RootNotActive();
        tokenId = _registerFor(label, msg.sender);
    }

    function registerFor(string calldata label, address recipient) external onlyOwner whenNotPaused returns (uint256 tokenId) {
        if (!rootActive) revert RootNotActive();
        tokenId = _registerFor(label, recipient);
    }

    function claimIdentity(string calldata label) external returns (uint256 tokenId) {
        _validateLabel(label);
        bytes32 node = _nodeForLabel(label);
        tokenId = uint256(node);

        (address wrappedOwner,, uint64 expiry) = _wrappedState(node);
        if (wrappedOwner == address(0) || wrappedOwner != msg.sender || expiry <= block.timestamp) {
            revert IdentityNotEligible(tokenId);
        }

        if (_ownerExists(tokenId)) {
            address current = ownerOf(tokenId);
            if (current == wrappedOwner) revert IdentityAlreadyAligned(tokenId);
            _burn(tokenId);
        }

        _mintIdentity(wrappedOwner, tokenId, label);
        emit IdentityClaimed(msg.sender, label, node);
    }

    function syncIdentity(uint256 tokenId) public {
        if (!_ownerExists(tokenId)) revert NonexistentToken(tokenId);

        (address wrappedOwner,, uint64 expiry) = _wrappedState(bytes32(tokenId));
        bool burnIdentity = wrappedOwner == address(0) || expiry <= block.timestamp || ownerOf(tokenId) != wrappedOwner;

        if (burnIdentity) {
            _burn(tokenId);
        }

        emit IdentitySynced(tokenId, burnIdentity, wrappedOwner, expiry);
    }

    function syncIdentityByLabel(string calldata label) external {
        _validateLabel(label);
        syncIdentity(uint256(_nodeForLabel(label)));
    }

    function available(string calldata label) external view returns (bool) {
        if (!_isValidLabel(label)) return false;
        bytes32 node = _nodeForLabel(label);
        (, , uint64 expiry) = _wrappedState(node);
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
        expectedExpiry = _trialExpiry();
        uint64 wrappedExpiry;
        (wrappedOwner,, wrappedExpiry) = _wrappedState(node);
        isAvailable = wrappedExpiry <= block.timestamp;
        resolver = ensRegistry.resolver(node);
        fullName = string.concat(label, ".", parentName);
        active = rootActive && !paused();
    }

    function validateLabel(string calldata label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_ownerExists(tokenId)) revert NonexistentToken(tokenId);

        IdentityData memory data = identityData[tokenId];
        bytes32 node = bytes32(tokenId);
        (, , uint64 expiry) = _wrappedState(node);
        string memory fullName = string.concat(data.label, ".", parentName);
        string memory status = expiry > block.timestamp ? "active" : "expired";

        string memory svg = _svgSimple(fullName, status, tokenId, node);
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
        string memory attributes = _attributesJson(data.label, status);
        string memory extension = _extensionJson(tokenId, node, data.label, data.mintedAt, expiry);

        string memory json = string.concat(
            '{"name":"', fullName,
            '","description":"Soulbound ENS-linked identity for alpha.agent.agi.eth.","image":"', image,
            '","attributes":', attributes,
            ',"extension":', extension,
            '}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svgSimple(string memory fullName, string memory status, uint256 tokenId, bytes32 node)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420"><rect width="800" height="420" fill="#2f1250"/><text x="24" y="64" fill="#f6ecff" font-size="24">',
            fullName,
            '</text><text x="24" y="104" fill="#dec5ff" font-size="16">root: ',
            parentName,
            '</text><text x="24" y="136" fill="#dec5ff" font-size="16">node: ',
            _toHex(uint256(node), 32),
            '</text><text x="24" y="168" fill="#dec5ff" font-size="16">tokenId: ',
            tokenId.toString(),
            '</text><text x="24" y="200" fill="#dec5ff" font-size="16">status: ',
            status,
            '</text></svg>'
        );
    }

    function _attributesJson(string memory label, string memory status) internal view returns (string memory) {
        return string.concat(
            '[{"trait_type":"root","value":"',
            parentName,
            '"},{"trait_type":"label","value":"',
            label,
            '"},{"trait_type":"soulbound","value":"true"},{"trait_type":"status","value":"',
            status,
            '"}]'
        );
    }

    function _extensionJson(uint256 tokenId, bytes32 node, string memory label, uint64 mintedAt, uint64 expiry)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            '{"parent_node":"', _toHex(uint256(parentNode), 32),
            '","node":"', _toHex(uint256(node), 32),
            '","labelhash":"', _toHex(uint256(keccak256(bytes(label))), 32),
            '","owner":"', _toHex(uint256(uint160(ownerOf(tokenId))), 20),
            '","resolver":"', _toHex(uint256(uint160(ensRegistry.resolver(node))), 20),
            '","expiry_unix":', uint256(expiry).toString(),
            ',"minted_at_unix":', uint256(mintedAt).toString(),
            ',"source":"onchain","ui_hint":"alpha-agent-sovereign-purple"}'
        );
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (!_ownerExists(tokenId)) revert NonexistentToken(tokenId);
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

    function _registerFor(string calldata label, address recipient) internal returns (uint256 tokenId) {
        if (recipient == address(0)) revert InvalidRecipient();
        _validateLabel(label);
        _assertRootReady();

        bytes32 node = _nodeForLabel(label);
        (address wrappedOwner,, uint64 existingExpiry) = _wrappedState(node);
        if (existingExpiry > block.timestamp && wrappedOwner != address(0)) revert Unavailable(node);

        uint64 expiry = _trialExpiry();
        nameWrapper.setSubnodeRecord(parentNode, label, recipient, address(0), 0, CHILD_FUSES, expiry);

        (address ownerAfter,,) = _wrappedState(node);
        if (ownerAfter != recipient) revert ChildOwnerMismatch(recipient, ownerAfter);

        tokenId = uint256(node);
        if (_ownerExists(tokenId)) {
            _burn(tokenId);
        }
        _mintIdentity(recipient, tokenId, label);
        emit IdentityRegistered(msg.sender, recipient, label, node, expiry);
    }

    function _mintIdentity(address recipient, uint256 tokenId, string memory label) internal {
        _mint(recipient, tokenId);
        identityData[tokenId] = IdentityData({label: label, mintedAt: uint64(block.timestamp)});
        emit Locked(tokenId);
    }

    function _burn(uint256 tokenId) internal override {
        super._burn(tokenId);
        delete identityData[tokenId];
    }

    function _assertRootReady() internal view {
        _effectiveParentExpiry();
        if (!nameWrapper.allFusesBurned(parentNode, CANNOT_UNWRAP)) revert ParentNotLocked(parentNode);
        if (!nameWrapper.canModifyName(parentNode, address(this))) revert RegistrarNotAuthorised(parentNode);
    }

    function _trialExpiry() internal view returns (uint64) {
        uint64 parentExpiry = _effectiveParentExpiry();
        uint64 nowTs = uint64(block.timestamp);
        uint64 maxExpiry = nowTs + TRIAL_PERIOD;
        return parentExpiry < maxExpiry ? parentExpiry : maxExpiry;
    }

    function _effectiveParentExpiry() internal view returns (uint64 effectiveExpiry) {
        try nameWrapper.getData(uint256(parentNode)) returns (address, uint32 fuses, uint64 expiry) {
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

    function _wrappedState(bytes32 node) internal view returns (address owner, uint32 fuses, uint64 expiry) {
        try nameWrapper.getData(uint256(node)) returns (address wrappedOwner, uint32 wrappedFuses, uint64 wrappedExpiry) {
            return (wrappedOwner, wrappedFuses, wrappedExpiry);
        } catch {
            return (address(0), 0, 0);
        }
    }

    function _nodeForLabel(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }

    function _isValidLabel(string memory label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        if (b.length < MIN_LABEL_LENGTH || b.length > MAX_LABEL_LENGTH) return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isDigit = c >= 0x30 && c <= 0x39;
            bool isLower = c >= 0x61 && c <= 0x7a;
            if (!isDigit && !isLower) return false;
        }
        return true;
    }

    function _validateLabel(string memory label) internal pure {
        bytes memory b = bytes(label);
        if (b.length < MIN_LABEL_LENGTH) revert LabelTooShort(b.length);
        if (b.length > MAX_LABEL_LENGTH) revert LabelTooLong(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isDigit = c >= 0x30 && c <= 0x39;
            bool isLower = c >= 0x61 && c <= 0x7a;
            if (!isDigit && !isLower) revert InvalidLabelCharacter(i, c);
        }
    }

    function _ownerExists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    function _toHex(uint256 value, uint256 byteLength) internal pure returns (string memory) {
        return Strings.toHexString(value, byteLength);
    }
    function namehash(string memory name) public pure returns (bytes32) {
        bytes memory str = bytes(name);
        if (str.length == 0) return bytes32(0);

        bytes32 node;
        uint256 i = str.length;
        uint256 labelLength;

        while (i > 0) {
            i--;
            if (str[i] == ".") {
                node = keccak256(abi.encodePacked(node, keccak256(_slice(str, i + 1, labelLength))));
                labelLength = 0;
            } else {
                labelLength++;
            }
        }

        return keccak256(abi.encodePacked(node, keccak256(_slice(str, 0, labelLength))));
    }

    function _slice(bytes memory str, uint256 start, uint256 len) internal pure returns (bytes memory) {
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = str[start + i];
        }
        return out;
    }
}
