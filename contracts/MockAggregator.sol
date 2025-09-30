// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

// Minimal mock for Chainlink AggregatorV3Interface
contract MockAggregator {
    uint8 public immutable decimals;
    int256 private _answer;
    uint80 private _roundId;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    constructor(uint8 _decimals, int256 answer) {
        decimals = _decimals;
        setAnswer(answer);
    }

    function setAnswer(int256 answer) public {
        _answer = answer;
        _roundId++;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }
}


