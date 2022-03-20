const BigNumber = require("bignumber.js");
const dayjs = require("dayjs");
const truffleAssert = require("truffle-assertions");
const { devConstants, mochaContexts } = require("@sablier/dev-utils");
const shouldBehaveLikeSablier = require("./Sablier.behavior");

const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const NonStandardERC20 = artifacts.require("./NonStandardERC20.sol");
const Sablier = artifacts.require("./Sablier.sol");
const MetaStream = artifacts.require("./MetaStream.sol");

ERC20Mock.numberFormat = "BigNumber";
NonStandardERC20.numberFormat = "BigNumber";
Sablier.numberFormat = "BigNumber";

const { 
  FIVE_UNITS,
  STANDARD_RATE_PER_SECOND,
  STANDARD_SALARY,
  STANDARD_TIME_OFFSET,
  STANDARD_TIME_DELTA,
  STANDARD_SCALE
 } = devConstants;

const { contextForStreamDidEnd, contextForStreamDidStartButNotEnd } = mochaContexts;

contract.skip("Sablier", function sablier([alice, bob, carol, eve]) {
  beforeEach(async function() {
    const opts = { from: alice };
    this.token = await ERC20Mock.new(opts);
    await this.token.mint(alice, STANDARD_SALARY.multipliedBy(3).toString(10), opts);

    this.nonStandardERC20Token = await NonStandardERC20.new(opts);
    this.nonStandardERC20Token.mint(alice, STANDARD_SALARY.toString(10), opts);

    this.sablier = await Sablier.new(opts);
  });

  shouldBehaveLikeSablier(alice, bob, carol, eve);
});

contract("MetaStream", function ([alice, bob, carol]) {
  beforeEach(async function() {
    const opts = { from: alice };
    this.token = await ERC20Mock.new(opts);
    await this.token.mint(alice, STANDARD_SALARY.multipliedBy(3).toString(10), opts);

    this.nonStandardERC20Token = await NonStandardERC20.new(opts);
    this.nonStandardERC20Token.mint(alice, STANDARD_SALARY.toString(10), opts);

    this.sablier = await Sablier.new(opts);
  })
  
  describe('constructor', function() {
    it('should deploy metatoken', async function() {
      this.metastream = await MetaStream.new(alice, this.sablier.address)
      const sablierAddress = await this.metastream.sablier()
      sablierAddress.should.be.equal(this.sablier.address)
      const metaTokenBalance = +(await this.metastream.balanceOf(alice)).toString()
      metaTokenBalance.should.be.equal(100)
      const owner = await this.metastream.owner()
      owner.should.be.equal(alice)
    })

    // owner != deployer
  })

  describe('createStream', function () {
    it('should create a sablier stream', async function() {
      const opts = { from: alice };
      const now = new BigNumber(dayjs().unix());
      const recipient = bob
      const deposit = STANDARD_SALARY.toString(10)
      const startTime = now.plus(STANDARD_TIME_OFFSET);
      const stopTime = startTime.plus(STANDARD_TIME_DELTA);

      this.metastream = await MetaStream.new(alice, this.sablier.address)
      await this.token.approve(this.metastream.address, deposit, opts);
      await this.metastream.createStream(
        recipient,
        deposit,
        this.token.address,
        startTime,
        stopTime,
        opts,
      )

      const streamId = await this.metastream.streamId()
      const streamObject = await this.sablier.getStream(streamId);
      streamObject.sender.should.be.equal(this.metastream.address); // metastream is sender
      streamObject.recipient.should.be.equal(recipient);
      streamObject.deposit.should.be.bignumber.equal(deposit);
      streamObject.tokenAddress.should.be.equal(this.token.address);
      streamObject.startTime.should.be.bignumber.equal(startTime);
      streamObject.stopTime.should.be.bignumber.equal(stopTime);
      streamObject.remainingBalance.should.be.bignumber.equal(deposit);
      streamObject.ratePerSecond.should.be.bignumber.equal(STANDARD_RATE_PER_SECOND);
    })
  })

  describe('cancel stream', function() {
    beforeEach(async function() {
      const opts = { from: alice };
      const now = new BigNumber(dayjs().unix());
      this.sender = alice
      this.recipient = bob
      this.deposit = STANDARD_SALARY.toString(10)
      const startTime = now.plus(STANDARD_TIME_OFFSET);
      const stopTime = startTime.plus(STANDARD_TIME_DELTA);

      this.metastream = await MetaStream.new(alice, this.sablier.address)
      await this.token.approve(this.metastream.address, this.deposit, opts);
      await this.metastream.createStream(
        this.recipient,
        this.deposit,
        this.token.address,
        startTime,
        stopTime,
        opts,
      )
      this.streamId = await this.metastream.streamId()
    })

    describe("when the stream did not start", function() {
      it("cancels the stream", async function() {
        await this.metastream.cancelStream({ from: alice });
        await truffleAssert.reverts(this.sablier.getStream(this.streamId), "stream does not exist");
      });
  
      it("transfers all tokens to the sender of the stream", async function() {
        const balance = await this.token.balanceOf(this.sender, this.opts);
        await this.metastream.cancelStream({ from: alice });
        const newBalance = await this.token.balanceOf(this.sender, this.opts);
        newBalance.should.be.bignumber.equal(balance.plus(this.deposit));
      })
    });

    contextForStreamDidStartButNotEnd(function() {
      const streamedAmount = FIVE_UNITS.toString(10);
  
      it("cancels the stream", async function() {
        await this.metastream.cancelStream({ from: alice });
        await truffleAssert.reverts(this.sablier.getStream(this.streamId), "stream does not exist");
      });
  
      it.skip("transfers the tokens to the sender of the stream", async function() {
        const balance = await this.token.balanceOf(this.sender, this.opts);
        await this.metastream.cancelStream({ from: alice });
        const newBalance = await this.token.balanceOf(this.sender, this.opts);
        const tolerateByAddition = false;
        newBalance.should.tolerateTheBlockTimeVariation(
          balance.minus(streamedAmount).plus(this.deposit),
          STANDARD_SCALE,
          tolerateByAddition,
        );
      });
  
      it.skip("transfers the tokens to the recipient of the stream", async function() {
        const balance = await this.token.balanceOf(this.recipient, this.opts);
        await this.metastream.cancelStream({ from: alice });
        const newBalance = await this.token.balanceOf(this.recipient, this.opts);
        newBalance.should.tolerateTheBlockTimeVariation(balance.plus(streamedAmount), STANDARD_SCALE);
      });

      describe.skip('recipient cancels stream via sablier', function() {
        it("transfers the tokens to the metastream contract", async function() {
          const aliceBalance = await this.token.balanceOf(this.sender, this.opts);
          await this.sablier.cancelStream(this.streamId, { from: bob });
          const newBalance = await this.token.balanceOf(this.metastream.address, this.opts);
          const sumBalance = aliceBalance.plus(newBalance)
          const tolerateByAddition = false;
          sumBalance.should.tolerateTheBlockTimeVariation(
            sumBalance.minus(streamedAmount).plus(this.deposit),
            STANDARD_SCALE,
            tolerateByAddition,
          );
        });

        it("transfers the tokens to the recipient of the stream", async function() {
          const balance = await this.token.balanceOf(this.recipient, this.opts);
          await this.sablier.cancelStream(this.streamId, { from: bob });
          const newBalance = await this.token.balanceOf(this.recipient, this.opts);
          newBalance.should.tolerateTheBlockTimeVariation(balance.plus(streamedAmount), STANDARD_SCALE);
        });
      })
    })
  })

  describe.only('split stream', function() {
    beforeEach(async function() {
      const opts = { from: alice };
      const now = new BigNumber(dayjs().unix());
      this.sender = alice
      this.recipient = bob
      this.deposit = STANDARD_SALARY.toString(10)
      this.startTime = now.plus(STANDARD_TIME_OFFSET);
      this.stopTime = this.startTime.plus(STANDARD_TIME_DELTA);

      this.metastream = await MetaStream.new(alice, this.sablier.address)
      await this.token.approve(this.metastream.address, this.deposit, opts);
      await this.metastream.createStream(
        this.recipient,
        this.deposit,
        this.token.address,
        this.startTime,
        this.stopTime,
        opts,
      )
      this.streamId = await this.metastream.streamId()
    })

    it('creates a new sablier stream', async function() {
      const streamId = +(this.streamId)
      await this.metastream.approve(this.metastream.address, 500, { from: alice });
      await this.metastream.splitStream(carol, 50, { from: alice })

      this.forkStreamId = +(await this.metastream.forks(0)).toString()
      this.streamId = +(await this.metastream.streamId()).toString()
      this.forkStreamId.should.be.equal(streamId + 1)
      this.streamId.should.be.equal(streamId + 2)

      // verify new main stream
      const streamObject = await this.sablier.getStream(this.streamId);
      streamObject.sender.should.be.equal(this.metastream.address); // metastream is sender
      streamObject.recipient.should.be.equal(bob); // recipient still
      // streamObject.deposit.should.be.bignumber.equal(deposit);
      streamObject.tokenAddress.should.be.equal(this.token.address);
      streamObject.startTime.should.be.bignumber.equal(this.startTime);
      streamObject.stopTime.should.be.bignumber.equal(this.stopTime);
      // streamObject.remainingBalance.should.be.bignumber.equal(deposit);

      // verify fork stream
      const forkStreamObject = await this.sablier.getStream(this.forkStreamId);
      forkStreamObject.sender.should.be.equal(this.metastream.address); // metastream is sender
      forkStreamObject.recipient.should.be.equal(carol); // recipient is now carol
      // forkStreamObject.deposit.should.be.bignumber.equal(deposit);
      forkStreamObject.tokenAddress.should.be.equal(this.token.address);
      forkStreamObject.startTime.should.be.bignumber.equal(this.startTime);
      forkStreamObject.stopTime.should.be.bignumber.equal(this.stopTime);
      // forkStreamObject.remainingBalance.should.be.bignumber.equal(deposit);
    })
  })
})