// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract MockNameWrapper {
    uint32 public constant CANNOT_UNWRAP = 1;

    struct NodeData {
        address owner;
        uint32 fuses;
        uint64 expiry;
        bool exists;
    }

    mapping(bytes32 => NodeData) internal _nodes;
    mapping(bytes32 => mapping(address => bool)) public canModify;

    error NotWrapped(bytes32 node);
    error NotAuthorised(bytes32 node, address caller);

    function setNodeData(bytes32 node, address owner, uint32 fuses, uint64 expiry, bool exists) external {
        _nodes[node] = NodeData(owner, fuses, expiry, exists);
    }

    function setCanModifyName(bytes32 node, address who, bool allowed) external {
        canModify[node][who] = allowed;
    }

    function canModifyName(bytes32 node, address addr) external view returns (bool) {
        return canModify[node][addr];
    }

    function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry) {
        bytes32 node = bytes32(id);
        NodeData memory data = _nodes[node];
        if (!data.exists) revert NotWrapped(node);
        return (data.owner, data.fuses, data.expiry);
    }

    function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool) {
        NodeData memory data = _nodes[node];
        if (!data.exists) return false;
        return (data.fuses & fuseMask) == fuseMask;
    }

    function setSubnodeOwner(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32) {
        if (!canModify[parentNode][msg.sender]) revert NotAuthorised(parentNode, msg.sender);
        bytes32 node = _childNode(parentNode, label);
        _nodes[node] = NodeData(newOwner, fuses, expiry, true);
        canModify[node][newOwner] = true;
        return node;
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
        if (!canModify[parentNode][msg.sender]) revert NotAuthorised(parentNode, msg.sender);
        bytes32 node = _childNode(parentNode, label);
        _nodes[node] = NodeData(owner, fuses, expiry, true);
        canModify[node][owner] = true;
        return node;
    }

    function _childNode(bytes32 parentNode, string calldata label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
