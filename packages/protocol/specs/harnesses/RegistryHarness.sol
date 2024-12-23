pragma solidity ^0.8.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./IRegistryExtended.sol";

contract RegistryHarness is IRegistryExtended {
  using SafeMath for uint256;

  bytes32 constant ATTESTATIONS_REGISTRY_ID = keccak256(abi.encodePacked("Attestations"));
  bytes32 constant LOCKED_PLANQ_REGISTRY_ID = keccak256(abi.encodePacked("LockedPlanq"));
  bytes32 constant GAS_CURRENCY_WHITELIST_REGISTRY_ID = keccak256(
    abi.encodePacked("GasCurrencyWhitelist")
  );
  bytes32 constant PLANQ_TOKEN_REGISTRY_ID = keccak256(abi.encodePacked("PlanqToken"));
  bytes32 constant GOVERNANCE_REGISTRY_ID = keccak256(abi.encodePacked("Governance"));
  bytes32 constant RESERVE_REGISTRY_ID = keccak256(abi.encodePacked("Reserve"));
  bytes32 constant RANDOM_REGISTRY_ID = keccak256(abi.encodePacked("Random"));
  bytes32 constant SORTED_ORACLES_REGISTRY_ID = keccak256(abi.encodePacked("SortedOracles"));
  bytes32 constant VALIDATORS_REGISTRY_ID = keccak256(abi.encodePacked("Validators"));

  uint256 constant iamValidators = 1;
  uint256 constant iamPlanqToken = 2;
  uint256 constant iamGovernance = 3;
  uint256 constant iamLockedPlanq = 4;

  uint256 whoami;

  constructor(bool test) public RegistryHarness(test) {}

  function getAddressFor(bytes32 identifier) public returns (address) {
    if (identifier == VALIDATORS_REGISTRY_ID) {
      whoami = iamValidators;
    } else if (identifier == PLANQ_TOKEN_REGISTRY_ID) {
      whoami = iamPlanqToken;
    } else if (identifier == GOVERNANCE_REGISTRY_ID) {
      whoami = iamGovernance;
    } else if (identifier == LOCKED_PLANQ_REGISTRY_ID) {
      whoami = iamLockedPlanq;
    }

    // Need to statically reason that registry always returns itself now.
    // In particular if can call state-modifying code through the registry (planqToken?).
    return address(this);
  }

  function getAddressForOrDie(bytes32 identifier) external returns (address) {
    address _addr = getAddressFor(identifier);

    require(_addr != address(0), "Identifier not recognized");
    return _addr;
  }

  // Local fields from other contracts are prefixed with contract name.
  // Ex: contractName_fieldName
  mapping(address => bool) validators_validating;
  mapping(address => bool) governance_isVoting;
  mapping(address => bool) validators_isVoting;

  uint256 lockedPlanq_totalWeight;
  mapping(address => uint256) lockedPlanq_accountWeight;
  mapping(address => address) lockedPlanq_accountFromVoter;
  mapping(address => address) lockedPlanq_voterFromAccount;
  mapping(address => bool) lockedPlanq_isVotingFrozen;

  mapping(address => uint256) planqToken_balanceOf;

  uint256 randomIndex;
  mapping(uint256 => bool) randomBoolMap;
  mapping(uint256 => uint256) randomUInt256Map;
  mapping(uint256 => address) randomAddressMap;

  function isValidating(address account) external returns (bool) {
    if (whoami == iamValidators) {
      return validators_validating[account];
    } else {
      return getRandomBool();
    }
  }

  function isVoting(address x) external returns (bool) {
    if (whoami == iamValidators) {
      return validators_isVoting[x];
    } else if (whoami == iamGovernance) {
      return governance_isVoting[x];
    } else {
      return getRandomBool();
    }
  }

  function getTotalWeight() external returns (uint256) {
    if (true || whoami == iamLockedPlanq) {
      return lockedPlanq_totalWeight;
    } else {
      return getRandomUInt256();
    }
  }

  function getAccountWeight(address account) external returns (uint256) {
    if (true || whoami == iamLockedPlanq) {
      return lockedPlanq_accountWeight[account];
    } else {
      return getRandomUInt256();
    }
  }

  function getAccountFromVoter(address voter) external returns (address) {
    if (true || whoami == iamLockedPlanq) {
      return lockedPlanq_accountFromVoter[voter];
    } else {
      return getRandomAddress();
    }
  }

  function getVoterFromAccount(address account) external returns (address) {
    if (true || whoami == iamLockedPlanq) {
      return lockedPlanq_voterFromAccount[account];
    } else {
      return getRandomAddress();
    }
  }

  function isVotingFrozen(address account) external returns (bool) {
    if (whoami == iamLockedPlanq) {
      return lockedPlanq_isVotingFrozen[account];
    } else {
      return getRandomBool();
    }
  }

  function transfer(address recipient, uint256 value) external returns (bool) {
    planqToken_balanceOf[msg.sender] = getRandomUInt256().sub(value);
    planqToken_balanceOf[recipient] = getRandomUInt256().add(value);
    return getRandomBool();
  }

  function getRandomBool() public returns (bool) {
    randomIndex = randomIndex.add(1);
    return randomBoolMap[randomIndex];
  }

  function getRandomUInt256() public returns (uint256) {
    randomIndex = randomIndex.add(1);
    return randomUInt256Map[randomIndex];
  }

  function getRandomAddress() public returns (address) {
    randomIndex = randomIndex.add(1);
    return randomAddressMap[randomIndex];
  }

}
