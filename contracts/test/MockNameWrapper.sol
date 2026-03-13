// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract MockNameWrapper is IERC1155 {
    uint32 internal constant CAN_EXTEND_EXPIRY = 1 << 18;
    struct NameData {
        address owner;
        uint32 fuses;
        uint64 expiry;
        bool exists;
    }

    mapping(bytes32 => NameData) public data;
    mapping(bytes32 => mapping(address => bool)) public canModify;
    mapping(address => mapping(address => bool)) public operatorApproval;

    function setNameData(bytes32 node, address owner, uint32 fuses, uint64 expiry, bool exists_) external {
        data[node] = NameData(owner, fuses, expiry, exists_);
    }

    function setCanModify(bytes32 node, address addr, bool allowed) external {
        canModify[node][addr] = allowed;
    }

    function setOperatorApproval(address account, address operator, bool approved) external {
        operatorApproval[account][operator] = approved;
    }

    function canModifyName(bytes32 node, address addr) external view returns (bool) {
        return canModify[node][addr];
    }

    function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry) {
        NameData memory d = data[bytes32(id)];
        if (!d.exists) {
            revert("not wrapped");
        }
        return (d.owner, d.fuses, d.expiry);
    }

    function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool) {
        NameData memory d = data[node];
        return d.exists && (d.fuses & fuseMask) == fuseMask;
    }

    function setSubnodeRecord(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address,
        uint64,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32) {
        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        data[node] = NameData(owner, fuses, expiry, true);
        return node;
    }


    function setSubnodeOwner(bytes32 parentNode, string calldata label, address owner, uint32 fuses, uint64 expiry)
        external
        returns (bytes32)
    {
        bytes32 node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        data[node] = NameData(owner, fuses, expiry, true);
        return node;
    }

    function extendExpiry(bytes32 node, uint64 newExpiry) external {
        NameData storage d = data[node];
        require(d.exists, "not wrapped");
        require(msg.sender == d.owner, "not owner");
        require((d.fuses & CAN_EXTEND_EXPIRY) == CAN_EXTEND_EXPIRY, "cannot extend");
        d.expiry = newExpiry;
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }

    function balanceOf(address, uint256) external pure returns (uint256) {
        return 0;
    }

    function balanceOfBatch(address[] calldata, uint256[] calldata) external pure returns (uint256[] memory balances) {
        balances = new uint256[](0);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operatorApproval[msg.sender][operator] = approved;
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return operatorApproval[account][operator];
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external pure {}

    function safeBatchTransferFrom(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure {}
}
