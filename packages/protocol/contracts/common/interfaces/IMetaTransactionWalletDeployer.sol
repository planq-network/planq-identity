pragma solidity ^0.8.0;

interface IMetaTransactionWalletDeployer {
    function deploy(address, address, bytes calldata) external;
}
