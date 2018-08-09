
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';
import chai from 'chai';
const Multisig = artifacts.require('./Multisig.sol');
const ERC721Storage = artifacts.require('./ERC721Storage.sol');

const should = chai
  .use(require('chai-as-promised'))
  .should();


contract('Multisig', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];

  it('should allow to spend from multisig', async () => {
    const stateToken = await ERC721Storage.new();

    await stateToken.mint(alice, 1).should.be.fulfilled;
    await stateToken.mint(bob, 2).should.be.fulfilled;

    const multisig = await Multisig.new({value: 1000});

    await multisig.release(stateToken.address).should.be.rejectedWith(EVMRevert);

    await multisig.setSig(stateToken.address, 1).should.be.fulfilled;
    await multisig.setSig(stateToken.address, 2, {from: bob}).should.be.fulfilled;

    await multisig.release(stateToken.address).should.be.fulfilled;
  });
});