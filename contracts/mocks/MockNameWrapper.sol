// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockNameWrapper is ERC1155 {
    struct NodeData {
        address owner;
        uint32 fuses;
        uint64 expiry;
        bool exists;
    }

    mapping(bytes32 => NodeData) internal nodeData;
    mapping(bytes32 => mapping(address => bool)) internal nodeApprovals;

    constructor() ERC1155("") {}

    function setNode(bytes32 node, address owner, uint32 fuses, uint64 expiry) external {
        nodeData[node] = NodeData(owner, fuses, expiry, true);
    }

    function setNodeApproval(bytes32 node, address operator, bool approved) external {
        nodeApprovals[node][operator] = approved;
    }

    function canModifyName(bytes32 node, address addr) external view returns (bool) {
        NodeData memory data = nodeData[node];
        if (!data.exists) return false;

        return addr == data.owner || nodeApprovals[node][addr] || isApprovedForAll(data.owner, addr);
    }

    function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry) {
        bytes32 node = bytes32(id);
        NodeData memory data = nodeData[node];
        require(data.exists, "NOT_WRAPPED");
        return (data.owner, data.fuses, data.expiry);
    }

    function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool) {
        NodeData memory data = nodeData[node];
        require(data.exists, "NOT_WRAPPED");
        return (data.fuses & fuseMask) == fuseMask;
    }

    function setSubnodeOwner(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32 node) {
        _requireCanModify(parentNode, msg.sender);
        node = _childNode(parentNode, label);
        nodeData[node] = NodeData(newOwner, fuses, expiry, true);
    }

    function setSubnodeRecord(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address,
        uint64,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32 node) {
        _requireCanModify(parentNode, msg.sender);
        node = _childNode(parentNode, label);
        nodeData[node] = NodeData(owner, fuses, expiry, true);
    }

    function setChildFuses(bytes32 node, uint32 fuses) external {
        require(nodeData[node].exists, "MISSING");
        nodeData[node].fuses = fuses;
    }

    function setChildExpiry(bytes32 node, uint64 expiry) external {
        require(nodeData[node].exists, "MISSING");
        nodeData[node].expiry = expiry;
    }

    function _requireCanModify(bytes32 node, address addr) internal view {
        NodeData memory data = nodeData[node];
        require(data.exists, "NOT_WRAPPED");
        require(addr == data.owner || nodeApprovals[node][addr] || isApprovedForAll(data.owner, addr), "UNAUTH");
    }

    function _childNode(bytes32 parentNode, string calldata label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
