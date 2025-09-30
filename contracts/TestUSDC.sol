// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestUSDC is ERC20 {
    uint8 private immutable _decimals;
    constructor(string memory n, string memory s, uint8 d, uint256 initialSupply, address to) ERC20(n, s) {
        _decimals = d;
        _mint(to, initialSupply);
    }
    function decimals() public view override returns (uint8) { return _decimals; }
}


