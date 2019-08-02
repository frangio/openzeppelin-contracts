const { BN, ether, expectEvent } = require('openzeppelin-test-helpers');
const gsn = require('@openzeppelin/gsn-helpers');

const { expect } = require('chai');

const GSNBouncerERC20FeeMock = artifacts.require('GSNBouncerERC20FeeMock');
const ERC20Detailed = artifacts.require('ERC20Detailed');
const IRelayHub = artifacts.require('IRelayHub');

contract('GSNBouncerERC20Fee', function ([_, sender, other]) {
  const name = 'FeeToken';
  const symbol = 'FTKN';
  const decimals = new BN('18');

  beforeEach(async function () {
    this.recipient = await GSNBouncerERC20FeeMock.new(name, symbol, decimals);
    this.token = await ERC20Detailed.at(await this.recipient.token());
  });

  describe('token', function () {
    it('has a name', async function () {
      expect(await this.token.name()).to.equal(name);
    });

    it('has a symbol', async function () {
      expect(await this.token.symbol()).to.equal(symbol);
    });

    it('has decimals', async function () {
      expect(await this.token.decimals()).to.be.bignumber.equal(decimals);
    });
  });

  context('when called directly', function () {
    it('mock function can be called', async function () {
      const { logs } = await this.recipient.mockFunction();
      expectEvent.inLogs(logs, 'MockFunctionCalled');
    });
  });

  context('when relay-called', function () {
    beforeEach(async function () {
      await gsn.fundRecipient(web3, { recipient: this.recipient.address });
      this.relayHub = await IRelayHub.at('0x537F27a04470242ff6b2c3ad247A05248d0d27CE');
    });

    it('charges the sender for GSN fees in tokens', async function () {
      // The recipient will be charged from its RelayHub balance, and in turn charge the sender from its sender balance.
      // Both amounts should be roughly equal.

      // The sender has a balance in tokens, not ether, but since the exchange rate is 1:1, this works fine.
      const senderPreBalance = ether('2');
      await this.recipient.mint(sender, senderPreBalance);

      const recipientPreBalance = await this.relayHub.balanceOf(this.recipient.address);

      const { tx } = await this.recipient.mockFunction({ from: sender, useGSN: true });
      await expectEvent.inTransaction(tx, IRelayHub, 'TransactionRelayed', { status: '0' });

      const senderPostBalance = await this.token.balanceOf(sender);
      const recipientPostBalance = await this.relayHub.balanceOf(this.recipient.address);

      const senderCharge = senderPreBalance.sub(senderPostBalance);
      const recipientCharge = recipientPreBalance.sub(recipientPostBalance);

      expect(senderCharge).to.be.bignumber.closeTo(recipientCharge, recipientCharge.divn(10));
    });
  });
});
