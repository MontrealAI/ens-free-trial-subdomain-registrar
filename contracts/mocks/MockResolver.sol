// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract MockResolver {
    mapping(bytes32 => address) public addresses;

    function setAddr(bytes32 node, address addr) external {
        addresses[node] = addr;
    }
}
