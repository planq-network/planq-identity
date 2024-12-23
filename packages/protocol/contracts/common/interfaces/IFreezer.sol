pragma solidity ^0.8.0;

interface IFreezer {
    function isFrozen(address) external view returns (bool);
}
