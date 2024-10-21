// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IResolutionCallback {
    function resolutionCallback(
        uint160 previousResolutionSqrtPriceX96
    ) external;
}
