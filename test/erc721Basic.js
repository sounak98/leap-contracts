
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import chai from 'chai';
const ERC721Basic = artifacts.require('./ERC721Basic.sol');

const should = chai
  .use(require('chai-as-promised'))
  .should();


contract('Parsec', (accounts) => {

  describe('ERC721Basic', function() {
    let token;
    before(async () => {
      token = await ERC721Basic.new();
    });

    it('should prevent submission by unbonded validators', async () => {
      await token.mint(accounts[0], 1).should.be.fulfilled;
      await token.transferFrom(accounts[0], accounts[1], 1).should.be.fulfilled;
    });
  });
});