// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface AggregatorV3InterfaceLike {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract MockAggregator is AggregatorV3InterfaceLike {
    uint8 private _decimals;
    string private _description;
    uint256 private _version;

    uint80 private _roundId;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    constructor(uint8 decimals_, int256 initialAnswer_) {
        _decimals = decimals_;
        _description = "Mock Aggregator";
        _version = 1;
        _roundId = 1;
        _answer = initialAnswer_;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }

    function decimals() external view override returns (uint8) { return _decimals; }
    function description() external view override returns (string memory) { return _description; }
    function version() external view override returns (uint256) { return _version; }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _roundId += 1;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }
}


