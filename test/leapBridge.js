
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';
import { Period, Block, Tx, Input, Output, Outpoint } from 'leap-core';
import chai from 'chai';
const LeapBridge = artifacts.require('./LeapBridge.sol');
const PriorityQueue = artifacts.require('./PriorityQueue.sol');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(require('chai-as-promised'))
  .should();

const deployBridge = async (token, periodTime) => {
  const pqLib = await PriorityQueue.new();
  LeapBridge.link('PriorityQueue', pqLib.address);
  const bridge = await LeapBridge.new(periodTime, 50, 0, 0, 50);
  bridge.registerToken(token.address);
  return bridge;
}

contract('LeapBridge', (accounts) => {
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];
  const charliePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

  describe('Slot', function() {
    const p = [];
    let bridge;
    let token;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      bridge = await deployBridge(token, 3);
      p[0] = await bridge.tipHash();
      token.transfer(bob, 1000);
      token.transfer(charlie, 1000);
    });
    describe('Auction', function() {
      it('should prevent submission by unbonded validators', async () => {
        await bridge.submitPeriod(0, p[0], '0x01', {from: alice}).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to auction slot and submit block', async () => {
        await token.approve(bridge.address, 1000, { from: alice });
        await bridge.bet(0, 100, alice, alice, { from: alice });
        await bridge.submitPeriod(0, p[0], '0x01', { from: alice }).should.be.fulfilled;
        p[1] = await bridge.tipHash();
      });

      it('should update slot instead of auction for same owner', async () => {
        const bal1 = await token.balanceOf(alice);
        await bridge.bet(2, 10, alice, alice, {from: alice}).should.be.fulfilled;
        await bridge.bet(2, 30, alice, alice, {from: alice}).should.be.fulfilled;
        const bal2 = await token.balanceOf(alice);
        const slot = await bridge.slots(2);
        assert.equal(Number(slot[2]), 30); // stake === 30
        assert.equal(Number(slot[7]), 0); // newStake === 0
        // all token missing in balance should be accounted in slot
        assert.equal(bal1.sub(bal2).toNumber(), Number(slot[2]));
      });

      it('should prevent auctining for lower price', async () => {
        await token.approve(bridge.address, 1000, {from: bob});
        await bridge.bet(0, 129, bob, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
        await bridge.bet(0, 131, bob, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to auction for higer price',  async () => {
        await bridge.bet(0, 170, bob, bob, {from: bob}).should.be.fulfilled;
      });

      it('should allow submission when slot auctioned in same epoch', async () => {
        await bridge.submitPeriod(0, p[1], '0x02', {from: alice}).should.be.fulfilled;
        p[2] = await bridge.tipHash();
      });

      it('should prevent submission by auctioned slot in later epoch', async () => {
        await bridge.submitPeriod(0, p[2], '0x03', {from: alice}).should.be.rejectedWith(EVMRevert);
        await bridge.submitPeriod(0, p[2], '0x03', {from: bob}).should.be.rejectedWith(EVMRevert);
      });

      it('allow to auction another slot', async () => {
        await token.approve(bridge.address, 1000, { from: charlie });
        await bridge.bet(1, 100, charlie, charlie, { from: charlie });
      });

      it('should allow to activate auctioned slot and submit', async () => {
        // increment Epoch
        await bridge.submitPeriod(1, p[2], '0x03', {from: charlie}).should.be.fulfilled;
        p[3] = await bridge.tipHash();
        await bridge.submitPeriod(1, p[3], '0x04', {from: charlie}).should.be.fulfilled;
        p[4] = await bridge.tipHash();
        await bridge.submitPeriod(1, p[4], '0x05', {from: charlie}).should.be.fulfilled;
        p[5] = await bridge.tipHash();
        let tip = await bridge.getTip();
        assert.equal(p[5], tip[0]);
        await bridge.submitPeriod(1, p[5], '0x06', {from: charlie}).should.be.fulfilled;
        p[6] = await bridge.tipHash();
        // activate and submit by bob
        const bal1 = await token.balanceOf(alice);
        await bridge.activate(0);
        const bal2 = await token.balanceOf(alice);
        assert.equal(bal1.add(200).toNumber(), bal2.toNumber());
        await bridge.submitPeriod(0, p[6], '0x07', {from: bob}).should.be.fulfilled;
        p[7] = await bridge.tipHash();
      });

      it('should allow to logout', async () => {
        await bridge.bet(0, 0, bob, bob, {from: charlie}).should.be.rejectedWith(EVMRevert);
        await bridge.bet(0, 0, bob, bob, {from: bob}).should.be.fulfilled;
      });

      it('should prevent submission by logged-out slot in later epoch', async () => {
        // increment epoch
        await bridge.submitPeriod(1, p[7], '0x08', {from: charlie}).should.be.fulfilled;
        p[8] = await bridge.tipHash();
        // try to submit when logged out
        await bridge.submitPeriod(0, p[8], '0x09', {from: bob}).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to withdraw after logout', async () => {
        // increment epoch
        await bridge.submitPeriod(1, p[8], '0x09', {from: charlie}).should.be.fulfilled;
        p[9] = await bridge.tipHash();
        await bridge.submitPeriod(1, p[9], '0x0a', {from: charlie}).should.be.fulfilled;
        p[10] = await bridge.tipHash();
        await bridge.submitPeriod(1, p[10], '0x0b', {from: charlie}).should.be.fulfilled;
        p[11] = await bridge.tipHash();
        // activate logout
        token.transfer(bridge.address, 2000);
        const bal1 = await token.balanceOf(bob);
        await bridge.activate(0);
        const bal2 = await token.balanceOf(bob);
        assert.equal(bal1.add(220).toNumber(), bal2.toNumber());
        // including genesis period, we have submiteed 12 periods in total:
        // epoch 1: period 0 - 2
        // epoch 2: period 3 - 5
        // epoch 3: period 6 - 8
        // epoch 4: period 9 - 11
        // =>  now we should be in epoch 5
        const lastEpoch = await bridge.lastCompleteEpoch();
        assert.equal(lastEpoch.toNumber(), 4);
        const height = await bridge.periods(p[11]);
        // we should have 12 * 32 => 384 blocks at this time
        assert.equal(height[1].toNumber(), 384);
      });
    });
  });

  describe('Consensus', function() {
    const p = [];
    let bridge;
    let token;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      bridge = await deployBridge(token, 8);
      p[0] = await bridge.tipHash();
      token.transfer(bob, 1000);
      token.transfer(charlie, 1000);
    });

    describe('Fork choice', function() {
      //
      // p0[] -> p1[s0] -> p2[s4]
      //
      it('should allow to extend chain', async () => {
        await token.approve(bridge.address, 10000, {from: alice}).should.be.fulfilled;
        await bridge.bet(0, 100, alice, alice, {from: alice}).should.be.fulfilled;
        await bridge.bet(1, 100, alice, alice, {from: alice}).should.be.fulfilled;
        await bridge.bet(2, 100, alice, alice, {from: alice}).should.be.fulfilled;
        await bridge.bet(3, 100, alice, alice, {from: alice}).should.be.fulfilled;

        let block = new Block(32).addTx(Tx.deposit(111, 100, alice, 1337));
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();
        await bridge.submitPeriod(0, p[0], p[1], {from: alice}).should.be.fulfilled;
        const tip = await bridge.getTip();
        assert.equal(p[1], tip[0]);

        await token.approve(bridge.address, 1000, {from: bob}).should.be.fulfilled;
        await bridge.bet(4, 100, bob, bob, {from: bob}).should.be.fulfilled;

        block = new Block(64).addTx(Tx.deposit(112, 100, bob, 1337));
        period = new Period(p[1], [block]);
        p[2] = period.merkleRoot();
        await bridge.submitPeriod(4, p[1], p[2], {from: bob}).should.be.fulfilled;
        assert.equal(p[2], await bridge.tipHash());
      });

      //                         /-> p3[s5]  <- 3 rewards
      // p0[] -> p1[s0] -> p2[s4] -> p4[s1]  <- 3 rewards
      //                         \-> p5[s4]  <- 2 rewards
      it('should allow to branch', async () => {
        await token.approve(bridge.address, 1000, {from: charlie}).should.be.fulfilled;
        await bridge.bet(5, 100, charlie, charlie, {from: charlie}).should.be.fulfilled;
        await bridge.bet(6, 100, charlie, charlie, {from: charlie}).should.be.fulfilled;
        await bridge.bet(7, 100, charlie, charlie, {from: charlie}).should.be.fulfilled;

        // 3 blocks in parallel
        let block = new Block(96).addTx(Tx.deposit(113, 300, charlie, 1337));
        let period = new Period(p[2], [block]);
        p[3] = period.merkleRoot();
        await bridge.submitPeriod(5, p[2], p[3], {from: charlie}).should.be.fulfilled;
        let tip = await bridge.getTip();
        assert.equal(p[3], (await bridge.getTip())[0]);

        block = new Block(96).addTx(Tx.deposit(114, 300, alice, 1337));
        period = new Period(p[3], [block]);
        p[4] = period.merkleRoot();
        await bridge.submitPeriod(1, p[2], p[4], {from: alice}).should.be.fulfilled;

        block = new Block(96).addTx(Tx.deposit(115, 300, bob, 1337));
        period = new Period(p[4], [block]);
        p[5] = period.merkleRoot();
        await bridge.submitPeriod(4, p[2], p[5], {from: bob}).should.be.fulfilled;

        // tip not updated because bob reused slot
        tip = await bridge.getTip();
        assert.equal(p[3], tip[0]);
        assert.equal(3, tip[1].toNumber());
      });

      //                         /-> p3[s5]  <- 3 rewards
      // p0[] -> p1[s0] -> p2[s4] -> p4[s1]  <- 3 rewards
      //                         \-> p5[s4] -> p6[s2] -> p7[s3]  <- 4 rewards
      it('should allow build longer chain', async () => {
        // submit new height, but same rewards as other tips
        let block = new Block(128).addTx(Tx.deposit(6, 400, alice, 1337));
        let period = new Period(p[5], [block]);
        p[6] = period.merkleRoot();
        await bridge.submitPeriod(2, p[5], p[6], {from: alice}).should.be.fulfilled;
        // check tip
        let tip = await bridge.getTip();
        assert.equal(p[3], tip[0]);
        assert.equal(3, tip[1].toNumber());

        // submit tip with most rewards
        block = new Block(160).addTx(Tx.deposit(7, 500, alice, 1337));
        period = new Period(p[6], [block]);
        p[7] = period.merkleRoot();
        await bridge.submitPeriod(3, p[6], p[7], {from: alice}).should.be.fulfilled;
        // check tip
        tip = await bridge.getTip();
        assert.equal(p[7], tip[0]);
        assert.equal(4, tip[1].toNumber());
      });

      //                         /-> p3[s5]  <- 3 rewards
      // p0[] -> p1[s0] -> p2[s4] -> p4[s1] -> p8[s6] -> p9[s7] -> p10[s2]   <- 6 rewards
      //                         \-> p5[s4] -> p6[s2] -> p7[s3]  <- 4 rewards
      it('should allow to extend other branch', async () => {

        let block = new Block(128).addTx(Tx.deposit(8, 400, charlie, 1337));
        let period = new Period(p[7], [block]);
        p[8] = period.merkleRoot();
        await bridge.submitPeriod(6, p[4], p[8], {from: charlie}).should.be.fulfilled;

        block = new Block(160).addTx(Tx.deposit(9, 500, charlie, 1337));
        period = new Period(p[8], [block]);
        p[9] = period.merkleRoot();
        await bridge.submitPeriod(7, p[8], p[9], {from: charlie}).should.be.fulfilled;

        block = new Block(192).addTx(Tx.deposit(10, 600, alice, 1337));
        period = new Period(p[9], [block]);
        p[10] = period.merkleRoot();
        await bridge.submitPeriod(2, p[9], p[10], {from: alice}).should.be.fulfilled;

        // check tip
        let tip = await bridge.getTip();
        assert.equal(p[10], tip[0]);
        assert.equal(6, tip[1].toNumber());
      });

      it('should allow to clip off light branch');

      //                           /-> xxxxxx
      // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c] -> b[7,e] -> b[8,e] -> ... -> b[15]
      //                           \-> xxxxxx -> b[6,c] -> b[16,c]
      it('should allow to prune');
    });

    describe('Block submission', function() {
      it('should properly change avg gas price', async () => {
        let lowGas = 10 ** 11;
        let highGas = 50 * (10 ** 11);

        let initialAvg = await bridge.averageGasPrice.call();

        let block = new Block(224).addTx(Tx.deposit(11, 700, alice, 1337));
        let period = new Period(p[10], [block]);
        p[11] = period.merkleRoot();
        await bridge.submitPeriod(0, p[10], p[11], {from: alice, gasPrice: highGas}).should.be.fulfilled;

        let incrAvg = await bridge.averageGasPrice.call();
        assert(incrAvg > initialAvg);
        let reqValue1 = Math.ceil(initialAvg.toNumber() - initialAvg.toNumber() / 15 + highGas / 15);
        assert.equal(incrAvg.toNumber(), reqValue1);

        block = new Block(256).addTx(Tx.deposit(12, 800, alice, 1337));
        period = new Period(p[11], [block]);
        p[12] = period.merkleRoot();
        await bridge.submitPeriod(1, p[11], p[12], {from: alice, gasPrice: lowGas}).should.be.fulfilled;

        let decrAvg = await bridge.averageGasPrice.call();
        assert(decrAvg < incrAvg);
        let reqValue2 = Math.ceil(incrAvg.toNumber() - incrAvg.toNumber() / 15 + lowGas / 15);
        assert.equal(decrAvg.toNumber(), reqValue2);
      })
    });
  });

  describe('Deposits and Exits', function() {
    const p = [];
    let bridge;
    let token;
    let nftToken;
    let nftColor;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      bridge = await deployBridge(token, 8);
      p[0] = await bridge.tipHash();
      // alice auctions slot
      await token.approve(bridge.address, 1000, {from: alice});
      await bridge.bet(0, 100, alice, alice, {from: alice}).should.be.fulfilled;
      // bob auctions slot
      token.transfer(bob, 1000);
      await token.approve(bridge.address, 1000, {from: bob});
      await bridge.bet(1, 100, bob, bob, {from: bob}).should.be.fulfilled;
      // charlie auctions slot
      token.transfer(charlie, 1000);
      await token.approve(bridge.address, 1000, {from: charlie});
      await bridge.bet(2, 100, charlie, charlie, {from: charlie}).should.be.fulfilled;

      // register NFT
      nftToken = await SpaceDustNFT.new();
      let receipt = await bridge.registerToken(nftToken.address);
      nftColor = receipt.logs[0].args.color.toNumber();
    });

    describe('Deposit', function() {
      it('should allow to deposit', async () => {
        // deposit 1
        let receipt = await bridge.deposit(bob, 200, 0, { from: bob });
        const depositId1 = receipt.logs[0].args.depositId.toNumber();
        // deposit 2 - here we use directDeposit without transfer

        await token.approve(bridge.address, 300, { from: alice });
        receipt = await bridge.deposit(alice, 300, 0, { from: alice }).should.be.fulfilled;
        const depositId2 = Buffer.from(receipt.receipt.logs[1].topics[1].replace('0x', ''), 'hex').readUInt32BE(28);
        assert(depositId1 < depositId2);
      });

      it('should not allow to deposit non-registered tokens', async () => {
        const nonRegisteredColor = 1;
        await token.approve(bridge.address, 1000, { from: bob });
        await bridge.deposit(bob, 200, nonRegisteredColor, { from: bob }).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to deposit NFT tokens', async () => {
        const nftToken = await SpaceDustNFT.new();
        let receipt = await nftToken.mint(bob, 10, true, 2);
        const tokenId = receipt.logs[0].args._tokenId;
        receipt = await bridge.registerToken(nftToken.address);
        const color = receipt.logs[0].args.color.toNumber();
        await nftToken.approve(bridge.address, tokenId, { from: bob });
        await bridge.deposit(bob, tokenId, color, { from: bob }).should.be.fulfilled;
      });
    });
    describe('Exit', function() {
      let transferProof;
      let depositId = 114;

      beforeEach(async () => {
        const deposit = Tx.deposit(depositId++, 100, alice);
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(50, bob), new Output(50, alice)]
        );

        transfer = transfer.sign([alicePriv]);
        let block = new Block(96).addTx(deposit).addTx(transfer);
        let period = new Period(p[0], [block]);
        p[2] = period.merkleRoot();
        await bridge.submitPeriod(0, p[0], p[2], {from: alice}).should.be.fulfilled;
        transferProof = period.proof(transfer);
      });

      it('should allow to exit valid utxo', async () => {
        // withdraw output
        await bridge.startExit(transferProof, 0, { from: bob });
        const bal1 = await token.balanceOf(bob);
        await bridge.finalizeExits(0);
        const bal2 = await token.balanceOf(bob);
        assert(bal1.toNumber() < bal2.toNumber());
      });

      it('should allow to exit only for utxo owner', async () => {
        // withdraw output
        await bridge.startExit(transferProof, 0, { from: charlie }).should.be.rejectedWith(EVMRevert);;
      });

      it('should allow to exit valid utxo at index 2', async () => {
        await token.approve(bridge.address, 1000, {from: alice});

        // withdraw second output
        await bridge.startExit(transferProof, 1, { from: alice });
        const bal1 = await token.balanceOf(alice);
        await bridge.finalizeExits(0);
        const bal2 = await token.balanceOf(alice);
        assert(bal1.toNumber() < bal2.toNumber());
      });

      it('should allow to challenge exit', async () => {
        const deposit = Tx.deposit(15, 50, alice);
        // utxo that will try exit
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(50, bob)]
        );
        transfer = transfer.sign([alicePriv]);
        // utxo that will have spend exit utxo
        let spend = Tx.transfer(
          [new Input(new Outpoint(transfer.hash(), 0))],
          [new Output(50, charlie)]
        );
        spend = spend.sign([bobPriv]);
        // submit period and get proofs
        let block = new Block(128).addTx(deposit).addTx(transfer).addTx(spend);
        let period = new Period(p[2], [block]);
        p[3] = period.merkleRoot();
        await bridge.submitPeriod(0, p[2], p[3], {from: alice}).should.be.fulfilled;
        const proof = period.proof(transfer);
        const spendProof = period.proof(spend);
        // withdraw output
        const event = await bridge.startExit(proof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        assert.equal(outpoint.getUtxoId(), spend.inputs[0].prevout.getUtxoId());


        // challenge exit and make sure exit is removed
        let exit = await bridge.exits(outpoint.getUtxoId());
        assert.equal(exit[2], bob);
        await bridge.challengeExit(spendProof, proof, 0, 0);
        exit = await bridge.exits(outpoint.getUtxoId());
        assert.equal((await bridge.tokens(0))[1], 1);
        const bal1 = await token.balanceOf(bob);
        await bridge.finalizeExits(0);
        const bal2 = await token.balanceOf(bob);
        // check transfer didn't happen
        assert.equal(bal1.toNumber(), bal2.toNumber());
        // check exit was evicted from PriorityQueue
        assert.equal((await bridge.tokens(0))[1], 0);
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

      it('should not be able to exit fake periods', async () => {
        const deposit = Tx.deposit(114, 50, alice);
        let block = new Block(96).addTx(deposit);
        let period = new Period(p[0], [block]);
        const proof = period.proof(deposit);

        // withdraw output
        const event = await bridge.startExit(proof, 0, { from: alice }).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to exit NFT utxo', async () => {
        // mint for alice
        let receipt = await nftToken.mint(alice, 10, true, 2);
        const tokenId = receipt.logs[0].args._tokenId;
        const tokenIdStr = tokenId.toString(10);
        
        // deposit
        await nftToken.approve(bridge.address, tokenId, { from: alice });
        receipt = await bridge.deposit(alice, tokenId, nftColor, { from: alice }).should.be.fulfilled;        
        const depositId = receipt.logs[0].args.depositId.toNumber();
        const deposit = Tx.deposit(depositId, tokenIdStr, alice, nftColor);
        
        // transfer to bob
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(tokenIdStr, bob, nftColor)]
        );
        transfer = transfer.sign([alicePriv]);

        // include in block and period
        let block = new Block(96).addTx(deposit).addTx(transfer);
        let period = new Period(p[0], [block]);
        p[2] = period.merkleRoot();
        await bridge.submitPeriod(0, p[0], p[2], { from: alice }).should.be.fulfilled;
        const proof = period.proof(transfer);

        // withdraw output
        assert.equal(await nftToken.ownerOf(tokenId), bridge.address);
        const event = await bridge.startExit(proof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        await bridge.finalizeExits(nftColor);
        assert.equal(await nftToken.ownerOf(tokenId), bob);
        assert.equal((await bridge.nftExits(nftColor, 0))[0], '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal((await bridge.exits(outpoint.getUtxoId()))[2], '0x0000000000000000000000000000000000000000');
      });

      it('should allow to challenge NFT exit', async () => {
        // mint for alice
        let receipt = await nftToken.mint(alice, 10, true, 3);
        const tokenId = receipt.logs[0].args._tokenId;
        const tokenIdStr = tokenId.toString(10);

        // deposit
        await nftToken.approve(bridge.address, tokenId, { from: alice });
        receipt = await bridge.deposit(alice, tokenId, nftColor, { from: alice }).should.be.fulfilled;        
        const depositId = receipt.logs[0].args.depositId.toNumber();
        const deposit = Tx.deposit(depositId, tokenIdStr, alice, nftColor);

        // utxo that will try exit
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(tokenIdStr, bob, nftColor)]
        );
        transfer = transfer.sign([alicePriv]);

        // utxo that will have spend exit utxo
        let spend = Tx.transfer(
          [new Input(new Outpoint(transfer.hash(), 0))],
          [new Output(tokenIdStr, charlie, nftColor)]
        );
        spend = spend.sign([bobPriv]);

        // submit period and get proofs
        let block = new Block(128).addTx(deposit).addTx(transfer).addTx(spend);
        let period = new Period(p[2], [block]);
        p[3] = period.merkleRoot();
        await bridge.submitPeriod(0, p[2], p[3], { from: alice }).should.be.fulfilled;
        const proof = period.proof(transfer);
        const spendProof = period.proof(spend);
        
        // withdraw output
        const event = await bridge.startExit(proof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        assert.equal(outpoint.getUtxoId(), spend.inputs[0].prevout.getUtxoId());
        // challenge exit and make sure exit is removed
        let exit = await bridge.exits(outpoint.getUtxoId());
        assert.equal((await bridge.nftExits(nftColor, 1))[0], outpoint.getUtxoId());
        assert.equal(exit[2], bob);
        
        await bridge.challengeExit(spendProof, proof, 0, 0);        
        exit = await bridge.exits(outpoint.getUtxoId());
        // check that exit was deleted
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
        await bridge.finalizeExits(nftColor);
        // check transfer didn't happen
        assert.equal(await nftToken.ownerOf(tokenId), bridge.address);        
        assert.equal((await bridge.nftExits(nftColor, 1))[0], '0x0000000000000000000000000000000000000000000000000000000000000000');
      });
    });
  });

  describe('Slashing', function() {
    const p = [];
    let bridge;
    let token;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      bridge = await deployBridge(token, 8);
      p[0] = await bridge.tipHash();

      await token.approve(bridge.address, 1000, { from: alice });
      await bridge.bet(0, 100, alice, alice, { from: alice });
      token.transfer(charlie, 1000);

      await token.approve(bridge.address, 1000, { from: charlie });
      await bridge.bet(1, 100, charlie, charlie, { from: charlie });
      await bridge.bet(2, 100, charlie, charlie, { from: charlie }).should.be.fulfilled;
    });

    describe('Double Spend', function() {
      it('should allow to slash doublespend', async () => {
        // create some tx spending an output
        const prevTx = '0x7777777777777777777777777777777777777777777777777777777777777777';
        const value = 99000000;
        let transfer = Tx.transfer(
          [new Input(new Outpoint(prevTx, 0))],
          [new Output(value, alice)]
        );
        transfer = transfer.sign([alicePriv]);

        // submit that tx
        let block = new Block(32);
        block.addTx(transfer);
        block.addTx(Tx.deposit(12, value, alice));
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();
        await bridge.submitPeriod(1, p[0], p[1], {from: charlie}).should.be.fulfilled;
        const prevProof = period.proof(transfer);

        // submit tx spending same out in later block
        block = new Block(64).addTx(transfer);
        period = new Period(p[1], [block]);
        p[2] = period.merkleRoot();
        await bridge.submitPeriod(2, p[1], p[2], {from: charlie}).should.be.fulfilled;
        const proof = period.proof(transfer);

        // check tip
        let tip = await bridge.getTip();
        assert.equal(p[2], tip[0]);

        // submit proof and get block deleted
        const bal1 = (await bridge.getSlot(2))[2];
        await bridge.reportDoubleSpend(proof, prevProof, {from: alice});
        const bal2 = (await bridge.getSlot(2))[2];
        assert(bal1.toNumber() > bal2.toNumber());

        // check tip
        tip = await bridge.getTip();
        assert.equal(p[1], tip[0]);
      });
    });
    describe('Deposit', function() {
      it('should allow to slash invalid deposit', async () => {
        // deposit
        const receipt = await bridge.deposit(charlie, 50, 0, { from: charlie });
        const depositId = receipt.logs[0].args.depositId.toNumber();
        const invalidDeposit = Tx.deposit(depositId, 50, alice);

        // wait until operator included
        let block = new Block(92).addTx(invalidDeposit);
        let period = new Period(p[1], [block]);
        p[2] = period.merkleRoot();
        await bridge.submitPeriod(0, p[1], p[2], {from: alice}).should.be.fulfilled;
        const proof = period.proof(invalidDeposit);

        // complain, if deposit tx wrong
        const bal1 = (await bridge.getSlot(0))[2];
        await bridge.reportInvalidDeposit(proof, {from: charlie});
        const bal2 = (await bridge.getSlot(0))[2];
        assert(bal1.toNumber() > bal2.toNumber());
      });
      it('should allow to slash double deposit');
    });
    describe('Same Height', function() {
      it('should allow to slash two periods at same height');
    });
  });

  describe('RegisterToken', function() {
    let bridge;
    let token;
    before(async () => {
      token = await SimpleToken.new();
      // initialize contract
      bridge = await deployBridge(token, 8);
    });

    it('should register a new ERC20 token', async () => {
      assert.equal((await bridge.tokens(0))[0], token.address);
      assert.equal((await bridge.tokenCount()).toNumber(), 1);

      const anotherToken = await SimpleToken.new();
      const res = await bridge.registerToken(anotherToken.address);
      
      const expectedColor = 1;
      assert.equal((await bridge.tokenCount()).toNumber(), 2);
      assert.equal((await bridge.tokens(expectedColor))[0], anotherToken.address);
      assert.equal(res.logs[0].event, 'NewToken');
      assert.equal(res.logs[0].args.color.toNumber(), expectedColor);
    });

    it('should register a new ERC721 token', async () => {
      assert.equal((await bridge.tokenCount()).toNumber(), 2);

      const nftToken = await SpaceDustNFT.new();
      const res = await bridge.registerToken(nftToken.address);

      const expectedColor = 2 ** 15 + 1; // NFT tokens namespace starts from 2^15 + 1
      assert.equal((await bridge.tokenCount()).toNumber(), 3);
      assert.equal((await bridge.tokens(expectedColor))[0], nftToken.address);
      assert.equal(res.logs[0].event, 'NewToken');
      assert.equal(res.logs[0].args.color.toNumber(), expectedColor);
    });

    it('should fail when registering a same token again', async () => {
      await bridge.registerToken(token.address).should.be.rejectedWith(EVMRevert);
    });
  });

  describe('Ownership', function() {
    let bridge;
    let token;
    beforeEach(async () => {
      token = await SimpleToken.new();
      bridge = await deployBridge(token, 3);
      token.transfer(bob, 1000);
      token.transfer(charlie, 1000);
    });

    it('should set sender as initial owner', async () => {
      assert.equal(await bridge.owner(), alice);
    });

    it('should be able to transfer ownership', async () => {
      await bridge.transferOwnership(bob);
      assert.equal(await bridge.owner(), bob);
    });

    it('non owner can not call registerToken', async () => {
      await bridge.registerToken(token.address, {from: bob}).should.be.rejectedWith(EVMRevert);
    });

    it('owner can set exit stake and non owner can not', async () => {
      await bridge.setExitStake(100);
      assert.equal(await bridge.exitStake(), 100);
      await bridge.setExitStake(200, {from: bob}).should.be.rejectedWith(EVMRevert);
    })
  });

});