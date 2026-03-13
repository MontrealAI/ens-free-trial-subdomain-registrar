// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockENSRegistry {
    mapping(bytes32 => address) public resolver;

    function setResolver(bytes32 node, address resolver_) external {
        resolver[node] = resolver_;
    }
}
