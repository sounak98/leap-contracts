pragma solidity ^0.4.24;

import "./ERC721Storage.sol";

contract Multisig {

  uint constant aliceStorage = 1;
  uint constant bobStorage = 2;

  constructor () public payable {}

  function release(address _stateTokenAddr) public {
    ERC721Storage stateToken = ERC721Storage(_stateTokenAddr);
    bool sigAlice = stateToken.getState(aliceStorage) != 0;
    bool sigBob = stateToken.getState(bobStorage) != 0;
    if (sigAlice && sigBob) {
      stateToken.ownerOf(2).transfer(address(this).balance);
    } else {
      throw;
    }
  }

  function setSig(address _stateTokenAddr, uint256 _ownerStateId) public {
    ERC721Storage stateToken = ERC721Storage(_stateTokenAddr);
    stateToken.setState(_ownerStateId, bytes32(1));
  }
}