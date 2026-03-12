// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract MockResolver {
    bytes32 public lastNode;
    address public lastAddress;

    function setAddr(bytes32 node, address addr) external {
        lastNode = node;
        lastAddress = addr;
    }
}
