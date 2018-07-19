
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';
import { Period, Block, Tx, Input, Output, Outpoint } from 'parsec-lib';
import chai from 'chai';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const PriorityQueue = artifacts.require('./PriorityQueue.sol');
const SimpleToken = artifacts.require('SimpleToken');

const should = chai
  .use(require('chai-as-promised'))
  .should();

const deployBridge = async (token, epochLength) => {
  const pqLib = await PriorityQueue.new();
  ParsecBridge.link('PriorityQueue', pqLib.address);
  const bridge = await ParsecBridge.new(epochLength, 50, 0, 0);
  bridge.registerToken(token.address);
  return bridge;
}

contract('Parsec', (accounts) => {
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];
  const charliePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';
  const ALL_SIGS = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  describe('Fraud Proof Challenge', function() {
    const p = [];
    let parsec;
    let token;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      parsec = await deployBridge(token, 3);
      p[0] = await parsec.tipHash();
      token.transfer(bob, 1000);
      let data = await parsec.contract.bet.getData(1, 100, bob, bob, bob);
      await token.approveAndCall(parsec.address, 1000, data, {from: bob});
      token.transfer(charlie, 1000);
      data = await parsec.contract.bet.getData(2, 100, charlie, charlie, charlie);
      await token.approveAndCall(parsec.address, 1000, data, {from: charlie});
    });

    it('should allow to build chain', async () => {
      console.log('Block 0: ', p[0]);

      // create a deposit
      const value = 99000000;
      const deposit = Tx.deposit(1, value, alice);

      // create some tx spending the deposit
      let spend1 = Tx.transfer(
        [new Input(new Outpoint(deposit.hash(), 0))],
        [new Output(value, bob)]
      );
      spend1 = spend1.sign([alicePriv]);

      // submit that tx
      let block = new Block(32);
      block.addTx(deposit);
      block.addTx(spend1);
      p[1] = block.merkleRoot();
      console.log('Block 1: ', p[1]);
      console.log('D1: ', deposit.hex());
      console.log('DS_PREV: ', spend1.hex());
      await parsec.submitPeriod(1, p[0], p[1], ALL_SIGS, {from: bob}).should.be.fulfilled;
      const prevProof = block.proof(spend1);

      // create some tx spending the same deposit
      let spend2 = Tx.transfer(
        [new Input(new Outpoint(deposit.hash(), 0))],
        [new Output(value, charlie)]
      );
      spend2 = spend2.sign([alicePriv]);

      // submit tx spending same output in later block
      block = new Block(64).addTx(spend2);
      p[2] = block.merkleRoot();
      console.log('');
      console.log('Block 2: ', p[2]);
      console.log('DS: ', spend2.hex());
      await parsec.submitPeriod(2, p[1], p[2], ALL_SIGS, {from: charlie}).should.be.fulfilled;
      const proof = block.proof(spend2);

      // create some spend from tx1
      let spend3 = Tx.transfer(
        [new Input(new Outpoint(spend1.hash(), 0))],
        [new Output(value, bob)]
      );
      spend3 = spend3.sign([bobPriv]);

      // submit that tx
      block = new Block(64);
      block.addTx(spend3);
      p[3] = block.merkleRoot();
      console.log('');
      console.log('Block 3: ', p[3]);
      console.log('exit: ', spend3.hex());
      await parsec.submitPeriod(1, p[1], p[3], ALL_SIGS, {from: bob}).should.be.fulfilled;
      const exitProof = block.proof(spend3);

      // start exit
      await parsec.startExit(exitProof, 0);

      // create some spend from exited tx
      let spend4 = Tx.transfer(
        [new Input(new Outpoint(spend3.hash(), 0))],
        [new Output(value, bob)]
      );
      spend4 = spend4.sign([bobPriv]);

      // submit that tx
      block = new Block(96);
      block.addTx(spend4);
      p[5] = block.merkleRoot();
      const vote2 = Tx.periodVote(p[5]);
      vote2.sign(bobPriv);
      console.log('');
      console.log('Block 5: ', p[5]);
      console.log('vote by slot 1: ', vote2.options.v, vote2.options.r, vote2.options.s);
      console.log('exitSpend: ', spend4.hex());
      await parsec.submitPeriod(2, p[3], p[5], ALL_SIGS, {from: charlie}).should.be.fulfilled;
      const spendProof = block.proof(spend4);

      // create another deposit
      const deposit2 = Tx.deposit(2, value, bob);

      // submit that in paralel block
      block = new Block(96);
      block.addTx(deposit2);
      p[4] = block.merkleRoot();
      const vote1 = Tx.periodVote(p[4]);
      vote1.sign(bobPriv);
      console.log('');
      console.log('Block 4: ', p[4]);
      console.log('vote by slot 1: ', vote1.options.v, vote1.options.r, vote1.options.s);
      console.log('D2: ', deposit2.hex());
      await parsec.submitPeriod(1, p[3], p[4], ALL_SIGS, {from: bob}).should.be.fulfilled;
    });

    it('allow to slash double spend', async () => {

      // reconstruct block 1
      let block = new Block(1);
      const deposit1 = Tx.fromRaw('0x0211000000010000000005e69ec00000f3beac30c498d9e26865f34fcaa57dbb935b0d74');
      const dsPref = Tx.fromRaw('0x0311846e4f732fd1c80e0a6d608cb0c732cfbe5cbf0efe1397c3d9a44f24170fd2f500d5275e033eb32583b0bdb0e0ef8c8164c43066868ad01eafc4491a980c4d84506d308f7995d30a855d9e5bafc73ed6ca4a6bebcf54569d161a774e64354c0ac11b0000000005e69ec00000e10f3d125e5f4c753a6456fc37123cf17c6900f2');
      block.addTx(deposit1);
      block.addTx(dsPref);
      // create proof for double spend tx
      const dsPrevProof = block.proof(dsPref);

      // reconstruct block 2
      block = new Block(64);
      const ds = Tx.fromRaw('0x0311846e4f732fd1c80e0a6d608cb0c732cfbe5cbf0efe1397c3d9a44f24170fd2f500e4fba28e17dbfbab505cc56472c919c80133d0b1125baf299af9d3239e9480a127c09002d9cfc39e4b16ba5cc81607200c54fd3a507a7a0e7cf97cb7a5e0159a1c0000000005e69ec0000082e8c6cf42c8d1ff9594b17a3f50e94a12cc860f');
      block.addTx(ds);
      // create proof for double spend tx
      const dsProof = block.proof(ds);

      // submit proofs and get block deleted
      const bal1 = (await parsec.getSlot(2))[2];
      await parsec.reportDoubleSpend(dsProof, dsPrevProof, {from: alice});
      const bal2 = (await parsec.getSlot(2))[2];
      assert(bal1.toNumber() > bal2.toNumber());
    });

    it('allow to exit challenge', async () => {
      // reconstruct block with exit tx
      let block = new Block(2);
      const exit = Tx.fromRaw('0x0311efcb630956a7b3c52eb6cda0ee11be33936562bf60214cd67794dc812353a0a200505d7bb19f0ac44a6e4c3715755c74a467ae385750b950c7d870bc77a4aa24bd2d41ea9b733b5290d08eae142233f3e546c5010abe50b843074a961547567f101c0000000005e69ec00000e10f3d125e5f4c753a6456fc37123cf17c6900f2');
      block.addTx(exit);
      // create proof for exit tx
      const exitProof = block.proof(exit);

      // reconstruct block with spend tx
      block = new Block(3);
      const exitSpend = Tx.fromRaw('0x0311f1afcb6eb68a85e2cedad832798a9d402557c85199a5cd8861948a1a279ebc0200e52762194a99e0afa59337fd512979b0e575b5025929a1149b38cd50f096883d25b874d0f7d69321085ea17f789fdb245583f217f84ca14eef5a2b4b8f0e145c1b0000000005e69ec00000e10f3d125e5f4c753a6456fc37123cf17c6900f2');
      block.addTx(exitSpend);
      // create proof for spend tx
      const exitSpendProof = block.proof(exitSpend);

      // submit exit challenge
      await parsec.challengeExit(exitSpendProof, exitProof, 0, 0);
      const bal1 = await token.balanceOf(bob);
      await parsec.finalizeExits(0);
      const bal2 = await token.balanceOf(bob);
      assert.equal(bal1.toNumber(), bal2.toNumber());
    });

    it('allow to challenge CAS', async () => {
      // get signature 1
      const vote1 = Tx.periodVote(p[4]);
      vote1.sign(bobPriv);

      // get signature 2
      const vote2 = Tx.periodVote(p[5]);
      vote2.sign(bobPriv);

      // submit to contract
      await parsec.slashDoubleSig(1, p[4], vote1.options.v, vote1.options.r, vote1.options.s, p[5], vote2.options.v, vote2.options.r, vote2.options.s);
    });

    it('allow to mine new block', async () => {
      // 1. get PSC from faucet
        // TODO: check that faucet working
      // 2. approve balance to contract
      await token.approve(parsec.address, 1000, {from: alice}).should.be.fulfilled;
      // 3. fund the slot
      await parsec.bet(0, 100, alice, alice, alice, {from: alice}).should.be.fulfilled;

      // create some tx
      const value = 99000000;
      const deposit3 = Tx.deposit(2, value, charlie);
      // create some block
      let block = new Block(4);
      block.addTx(deposit3);
      p[6] = block.merkleRoot();
      // submit it
      await parsec.submitPeriod(0, p[5], p[6], ALL_SIGS, {from: alice}).should.be.fulfilled;
    });

  });
});
