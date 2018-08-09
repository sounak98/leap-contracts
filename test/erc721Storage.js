
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import chai from 'chai';
const ERC721Storage = artifacts.require('./ERC721Storage.sol');

const should = chai
  .use(require('chai-as-promised'))
  .should();


contract('Parsec', (accounts) => {

  describe('ERC721Storage', function() {
    let token;
    before(async () => {
      token = await ERC721Storage.new();
    });

    it('should prevent submission by unbonded validators', async () => {
      await token.mint(accounts[0], 1).should.be.fulfilled;
      await token.transferFrom(accounts[0], accounts[1], 1).should.be.fulfilled;
      // function setStorage(uint256 _tokenId, bytes32[] _proof, uint256 _pos, bytes32 _oldElem, bytes32 _newElem
      await token.setStorage(1, [], 0, 0, 0x1234, {from: accounts[1]}).should.be.fulfilled;
      // uint256 _tokenId, bytes32[] _proof, bytes32 _elem, uint256 _pos
      const rsp = await token.getStorage(1, [], 0x1234, 0);
      console.log(rsp);
    });
  });
});