// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

uint32 constant CANNOT_UNWRAP = 1;
uint32 constant PARENT_CANNOT_CONTROL = 1 << 16;
uint32 constant IS_DOT_ETH = 1 << 17;

interface INameWrapper is IERC1155 {
    function canModifyName(bytes32 node, address addr) external view returns (bool);
    function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry);
    function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool);
    function setSubnodeOwner(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);
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
error InvalidOwner();
error ResolverRequired();
error ResolverNotContract(address resolver);
error LabelTooShort(uint256 length);
error LabelTooLong(uint256 length);
error InvalidLabelCharacter(uint256 index, bytes1 character);
error InvalidOwnerControlledFuses(uint16 fuses);
error EtherNotAccepted();
error RecordNamehashMismatch(bytes32 expectedNode, bytes32 providedNode);
error InvalidRecordPayload(uint256 index);
error InvalidWrapper();

/// @title ENS Free Trial Subdomain Registrar
/// @notice Free, 30-day ENS subname registrar for wrapped parent names.
/// @dev Child expiry is min(block.timestamp + 30 days, parent effective expiry).
///      No child grace period is added. CAN_EXTEND_EXPIRY is intentionally not granted.
contract FreeTrialSubdomainRegistrar is ERC1155Holder, ReentrancyGuard {
    using Address for address;

    uint64 public constant TRIAL_PERIOD = 30 days;
    uint64 public constant PARENT_GRACE_PERIOD = 90 days;
    uint256 public constant MIN_LABEL_LENGTH = 8;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    INameWrapper public immutable wrapper;
    mapping(bytes32 => bool) public activeParents;

    event ParentConfigured(bytes32 indexed parentNode, bool active);
    event NameRegistered(
        bytes32 indexed parentNode,
        bytes32 indexed node,
        address indexed owner,
        string label,
        uint64 expiry,
        uint16 ownerControlledFuses
    );

    constructor(address wrapper_) {
        if (wrapper_ == address(0)) revert InvalidWrapper();
        wrapper = INameWrapper(wrapper_);
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

    /// @notice Activates or deactivates a wrapped parent name for free-trial registrations.
    /// @dev The caller must be able to modify the wrapped parent.
    function setupDomain(bytes32 parentNode, bool active) external authorised(parentNode) {
        if (active) {
            _trialExpiry(parentNode);
            _requireParentLocked(parentNode);
            _requireRegistrarAuthorised(parentNode);
        }

        activeParents[parentNode] = active;
        emit ParentConfigured(parentNode, active);
    }

    /// @notice Registers a free trial subname.
    /// @param parentNode Wrapped ENS parent node.
    /// @param label Lowercase alphanumeric label, length 8..63.
    /// @param newOwner Final owner of the wrapped subname.
    /// @param resolver Resolver address, or zero address if no resolver is needed.
    /// @param ownerControlledFuses Optional owner-controlled fuses. If nonzero, must include CANNOT_UNWRAP.
    /// @param records Optional resolver calls. If present, resolver must be a contract and payloads must embed the child namehash.
    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 ownerControlledFuses,
        bytes[] calldata records
    ) external nonReentrant {
        if (!activeParents[parentNode]) revert ParentNameNotActive(parentNode);
        if (newOwner == address(0)) revert InvalidOwner();

        _validateLabel(label);
        _validateOwnerControlledFuses(ownerControlledFuses);
        _validateResolver(resolver, records.length);

        uint64 expiry = _trialExpiry(parentNode);
        _requireParentLocked(parentNode);
        _requireRegistrarAuthorised(parentNode);

        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        if (!available(node)) revert Unavailable(node);

        if (records.length > 0) {
            wrapper.setSubnodeOwner(parentNode, label, address(this), 0, expiry);
            _setRecords(node, resolver, records);
        }

        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            0,
            uint32(ownerControlledFuses) | PARENT_CANNOT_CONTROL,
            expiry
        );

        emit NameRegistered(parentNode, node, newOwner, label, expiry, ownerControlledFuses);
    }

    /// @notice Returns true if the subname can be registered right now.
    function available(bytes32 node) public view returns (bool) {
        try wrapper.getData(uint256(node)) returns (
            address,
            uint32,
            uint64 expiry
        ) {
            return expiry <= block.timestamp;
        } catch {
            return true;
        }
    }

    /// @notice Pure label validator for frontends and scripts.
    function validateLabel(string calldata label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    /// @notice Preview the expiry that would be used for the next registration.
    function nextExpiry(bytes32 parentNode) external view returns (uint64) {
        return _trialExpiry(parentNode);
    }

    function _trialExpiry(bytes32 parentNode) internal view returns (uint64) {
        uint64 parentExpiry = _effectiveParentExpiry(parentNode);
        uint64 nowTs = uint64(block.timestamp);
        uint64 remaining = parentExpiry - nowTs;
        uint64 duration = remaining > TRIAL_PERIOD ? TRIAL_PERIOD : remaining;
        return nowTs + duration;
    }

    function _effectiveParentExpiry(bytes32 parentNode) internal view returns (uint64 effectiveExpiry) {
        try wrapper.getData(uint256(parentNode)) returns (
            address,
            uint32 fuses,
            uint64 expiry
        ) {
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
        if (!wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP)) {
            revert ParentNotLocked(parentNode);
        }
    }

    function _requireRegistrarAuthorised(bytes32 parentNode) internal view {
        if (!wrapper.canModifyName(parentNode, address(this))) {
            revert RegistrarNotAuthorised(parentNode);
        }
    }

    function _validateResolver(address resolver, uint256 recordCount) internal view {
        if (recordCount == 0) {
            if (resolver != address(0) && !resolver.isContract()) {
                revert ResolverNotContract(resolver);
            }
            return;
        }

        if (resolver == address(0)) revert ResolverRequired();
        if (!resolver.isContract()) revert ResolverNotContract(resolver);
    }

    function _validateOwnerControlledFuses(uint16 ownerControlledFuses) internal pure {
        if (ownerControlledFuses != 0 && (ownerControlledFuses & uint16(CANNOT_UNWRAP)) == 0) {
            revert InvalidOwnerControlledFuses(ownerControlledFuses);
        }
    }

    function _validateLabel(string calldata label) internal pure {
        bytes memory labelBytes = bytes(label);
        uint256 length = labelBytes.length;

        if (length < MIN_LABEL_LENGTH) revert LabelTooShort(length);
        if (length > MAX_LABEL_LENGTH) revert LabelTooLong(length);

        for (uint256 i = 0; i < length; ) {
            bytes1 character = labelBytes[i];
            bool isNumber = character >= 0x30 && character <= 0x39;
            bool isLowerAlpha = character >= 0x61 && character <= 0x7A;

            if (!isNumber && !isLowerAlpha) {
                revert InvalidLabelCharacter(i, character);
            }

            unchecked {
                ++i;
            }
        }
    }

    function _isValidLabel(string calldata label) internal pure returns (bool) {
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

    function _setRecords(bytes32 node, address resolver, bytes[] calldata records) internal {
        for (uint256 i = 0; i < records.length; ) {
            if (records[i].length < 36) revert InvalidRecordPayload(i);

            bytes32 txNamehash = bytes32(records[i][4:36]);
            if (txNamehash != node) {
                revert RecordNamehashMismatch(node, txNamehash);
            }

            resolver.functionCall(records[i], "FreeTrialSubdomainRegistrar: failed to set record");

            unchecked {
                ++i;
            }
        }
    }
}
