// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import {TickMath} from "../external/univ3/TickMath.sol";
import {FullMath} from "../external/univ3/FullMath.sol";
import {DecimalPrice} from "./DecimalPrice.sol";

import "forge-std/console2.sol";

library Quote {
    function quoteGasToEthWithPrice(
        uint256 gasAmount,
        uint256 price
    ) internal pure returns (uint256) {
        return FullMath.mulDiv(gasAmount, price, 1e18);
    }

    function quoteGasToEth(
        //@audit added by fuzzer for compatibility
        uint256 gasAmount,
        uint160 sqrtRatioX96
    ) internal pure returns (uint256) {
        // TODO we can use the precalculated D18 price instead of srqtRatioX96 (or maybe another function)
        return
            FullMath.mulDiv(
                gasAmount,
                DecimalPrice.sqrtRatioX96ToPrice(sqrtRatioX96),
                1e18
            );
    }
}
