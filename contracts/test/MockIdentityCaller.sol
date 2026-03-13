// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IFreeTrialSubdomainRegistrarIdentity {
    function claimIdentity(bytes32 node) external returns (uint256 tokenId);
}

contract MockIdentityCaller {
    function claim(address identity, bytes32 node) external returns (uint256) {
        return IFreeTrialSubdomainRegistrarIdentity(identity).claimIdentity(node);
    }
}
