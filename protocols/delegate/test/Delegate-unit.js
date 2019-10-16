const Delegate = artifacts.require('Delegate')
const Swap = artifacts.require('Swap')
const MockContract = artifacts.require('MockContract')
const {
  equal,
  passes,
  emitted,
  reverted,
} = require('@airswap/test-utils').assert
const { takeSnapshot, revertToSnapShot } = require('@airswap/test-utils').time
const { EMPTY_ADDRESS } = require('@airswap/order-utils').constants

const { orders } = require('@airswap/order-utils')

contract('Delegate Unit Tests', async accounts => {
  const owner = accounts[0]
  const tradeWallet = accounts[1]
  const notOwner = accounts[2]
  const notTradeWallet = accounts[3]
  const mockRegistry = accounts[4]
  let delegate
  let mockSwap
  let snapshotId
  let swapFunction
  const SIGNER_TOKEN = accounts[9]
  const SENDER_TOKEN = accounts[8]
  const MAX_SENDER_AMOUNT = 12345
  const PRICE_COEF = 4321
  const EXP = 2

  beforeEach(async () => {
    let snapShot = await takeSnapshot()
    snapshotId = snapShot['result']
  })

  afterEach(async () => {
    await revertToSnapShot(snapshotId)
  })

  async function setupMockSwap() {
    let swapTemplate = await Swap.new(mockRegistry)
    const order = await orders.getOrder({})
    swapFunction = swapTemplate.contract.methods.swap(order).encodeABI()

    mockSwap = await MockContract.new()

    orders.setVerifyingContract(mockSwap.address)
  }

  before('deploy Delegate', async () => {
    await setupMockSwap()
    delegate = await Delegate.new(
      mockSwap.address,
      EMPTY_ADDRESS,
      tradeWallet,
      {
        from: owner,
      }
    )
  })

  describe('Test constructor', async () => {
    it('Test initial Swap Contract', async () => {
      let val = await delegate.swapContract.call()
      equal(val, mockSwap.address, 'swap address is incorrect')
    })

    it('Test initial trade wallet value', async () => {
      let val = await delegate.tradeWallet.call()
      equal(val, tradeWallet, 'trade wallet is incorrect')
    })

    it('Test constructor sets the owner as the trade wallet on empty address', async () => {
      let newDelegate = await Delegate.new(
        mockSwap.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        {
          from: owner,
        }
      )

      let val = await newDelegate.tradeWallet.call()
      equal(val, owner, 'trade wallet is incorrect')
    })

    it('Test owner is set correctly having been provided an empty address', async () => {
      let val = await delegate.owner.call()
      equal(val, owner, 'owner is incorrect - should be owner')
    })

    it('Test owner is set correctly if provided an address', async () => {
      let newDelegate = await Delegate.new(
        mockSwap.address,
        notOwner,
        tradeWallet,
        {
          from: owner,
        }
      )

      // being provided an empty address, it should leave the owner unchanged
      let val = await newDelegate.owner.call()
      equal(val, notOwner, 'owner is incorrect - should be notOwner')
    })
  })

  describe('Test setters', async () => {
    it('Test setRule permissions as not owner', async () => {
      //not owner is not apart of admin and should fail
      await reverted(
        delegate.setRule(
          SENDER_TOKEN,
          SIGNER_TOKEN,
          MAX_SENDER_AMOUNT,
          PRICE_COEF,
          EXP,
          { from: notOwner }
        ),
        'CALLER_MUST_BE_ADMIN'
      )
    })

    it('Test setRule permissions after not owner is admin', async () => {
      //test again after adding not owner to admin
      await delegate.addAdmin(notOwner)
      await passes(
        delegate.setRule(
          SENDER_TOKEN,
          SIGNER_TOKEN,
          MAX_SENDER_AMOUNT,
          PRICE_COEF,
          EXP,
          { from: notOwner }
        )
      )
    })

    it('Test setRule permissions as owner', async () => {
      await passes(
        delegate.setRule(
          SENDER_TOKEN,
          SIGNER_TOKEN,
          MAX_SENDER_AMOUNT,
          PRICE_COEF,
          EXP,
          { from: owner }
        )
      )
    })

    it('Test setRule', async () => {
      let trx = await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      //check if rule has been added
      let rule = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        rule[0].toNumber(),
        MAX_SENDER_AMOUNT,
        'max delegate amount is incorrectly saved'
      )
      equal(rule[1].toNumber(), PRICE_COEF, 'price coef is incorrectly saved')
      equal(rule[2].toNumber(), EXP, 'price exp is incorrectly saved')

      //check emitted event
      emitted(trx, 'SetRule', e => {
        return (
          e.signerToken === SIGNER_TOKEN &&
          e.senderToken === SENDER_TOKEN &&
          e.maxSenderAmount.toNumber() === MAX_SENDER_AMOUNT &&
          e.priceCoef.toNumber() === PRICE_COEF &&
          e.priceExp.toNumber() === EXP
        )
      })
    })

    it('Test unsetRule permissions as not owner', async () => {
      //not owner is not apart of admin and should fail
      await reverted(
        delegate.unsetRule(SENDER_TOKEN, SIGNER_TOKEN, { from: notOwner }),
        'CALLER_MUST_BE_ADMIN'
      )
    })

    it('Test unsetRule permissions after not owner is admin', async () => {
      //test again after adding not owner to admin
      await delegate.addAdmin(notOwner)
      await passes(
        delegate.unsetRule(SENDER_TOKEN, SIGNER_TOKEN, { from: notOwner })
      )
    })

    it('Test unsetRule permissions', async () => {
      await passes(
        delegate.unsetRule(SENDER_TOKEN, SIGNER_TOKEN, { from: owner })
      )
    })

    it('Test unsetRule', async () => {
      let trx = await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      //ensure rule has been added
      let ruleBefore = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        ruleBefore[0].toNumber(),
        MAX_SENDER_AMOUNT,
        'max delegate amount is incorrectly saved'
      )

      trx = await delegate.unsetRule(SENDER_TOKEN, SIGNER_TOKEN)

      //check that the rule has been removed
      let ruleAfter = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        0,
        'max delgate amount is incorrectly saved'
      )
      equal(ruleAfter[1].toNumber(), 0, 'price coef is incorrectly saved')
      equal(ruleAfter[2].toNumber(), 0, 'price exp is incorrectly saved')

      //check emitted event
      emitted(trx, 'UnsetRule', e => {
        return e.senderToken === SENDER_TOKEN && e.signerToken === SIGNER_TOKEN
      })
    })
  })

  describe('Test setTradeWallet', async () => {
    it('Test setTradeWallet when not owner', async () => {
      await reverted(delegate.setTradeWallet(notOwner, { from: notOwner }))
    })

    it('Test setTakerWallet when owner', async () => {
      await passes(delegate.setTradeWallet(notOwner, { from: owner }))
    })
  })

  describe('Test admin', async () => {
    it('Test adding to admin as owner', async () => {
      await passes(delegate.addAdmin(notOwner))
    })

    it('Test adding to admin as not owner', async () => {
      await reverted(delegate.addAdmin(notOwner, { from: notOwner }))
    })

    it('Test removal from admin', async () => {
      await delegate.addAdmin(notOwner)
      await passes(delegate.removeAdmin(notOwner))
    })

    it('Test removal of owner from admin', async () => {
      await reverted(delegate.removeAdmin(owner), 'OWNER_MUST_BE_ADMIN')
    })

    it('Test removal from admin as not owner', async () => {
      await reverted(delegate.removeAdmin(notOwner, { from: notOwner }))
    })

    it('Test adding to admin event emitted', async () => {
      let trx = await delegate.addAdmin(notOwner)
      await emitted(trx, 'AdminAdded', e => {
        return e.account == notOwner
      })
    })

    it('Test removing from admin event emitted', async () => {
      let trx = await delegate.removeAdmin(notOwner)
      await emitted(trx, 'AdminRemoved', e => {
        return e.account == notOwner
      })
    })
  })

  describe('Test transfer of ownership', async () => {
    it('Test ownership after transfer', async () => {
      await delegate.transferOwnership(notOwner)
      let val = await delegate.owner.call()
      equal(val, notOwner, 'owner was not passed properly')
    })
  })

  describe('Test setTakerWallet', async () => {
    it('Test setTakerWallet permissions', async () => {
      await reverted(delegate.setTradeWallet(notOwner, { from: notOwner }))
    })

    it('Test ownership after transfer', async () => {
      await reverted(
        delegate.transferOwnership(EMPTY_ADDRESS),
        'DELEGATE_CONTRACT_OWNER_REQUIRED'
      )
    })
  })

  describe('Test getSignerSideQuote', async () => {
    it('test when rule does not exist', async () => {
      const NON_EXISTENT_SIGNER_TOKEN = accounts[7]
      let val = await delegate.getSignerSideQuote.call(
        1234,
        SENDER_TOKEN,
        NON_EXISTENT_SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if a delegate does not exist'
      )
    })

    it('test when delegate amount is greater than max delegate amount', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await delegate.getSignerSideQuote.call(
        MAX_SENDER_AMOUNT + 1,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if delegate amount is greater than delegate max amount'
      )
    })

    it('test when delegate amount is 0', async () => {
      await delegate.setRule(
        SIGNER_TOKEN,
        SENDER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await delegate.getSignerSideQuote.call(
        0,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if delegate amount is 0'
      )
    })

    it('test a successful call - getSignerSideQuote', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let val = await delegate.getSignerSideQuote.call(
        1234,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      let expectedValue = Math.floor((1234 * PRICE_COEF) / 10 ** EXP)
      equal(val.toNumber(), expectedValue, 'there should be a quote available')
    })
  })

  describe('Test getSenderSideQuote', async () => {
    it('test when rule does not exist', async () => {
      let val = await delegate.getSenderSideQuote.call(
        4312,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if a delegate does not exist'
      )
    })

    it('test when delegate amount is not within acceptable value bounds', async () => {
      await delegate.setRule(SENDER_TOKEN, SIGNER_TOKEN, 100, 1, 0)
      let val = await delegate.getSenderSideQuote.call(
        0,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if returned delegate amount is 0'
      )

      val = await delegate.getSenderSideQuote.call(
        MAX_SENDER_AMOUNT + 1,
        SENDER_TOKEN,
        SIGNER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if returned greater than max delegate amount'
      )
    })

    it('test a successful call - getSenderSideQuote', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let val = await delegate.getSenderSideQuote.call(
        500,
        SIGNER_TOKEN,
        SENDER_TOKEN
      )
      let expectedValue = Math.floor((500 * 10 ** EXP) / PRICE_COEF)
      equal(val.toNumber(), expectedValue, 'there should be a quote available')
    })
  })

  describe('Test getMaxQuote', async () => {
    it('test when rule does not exist', async () => {
      let val = await delegate.getMaxQuote.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        val[0].toNumber(),
        0,
        'no quote should be available if a delegate does not exist'
      )
      equal(
        val[1].toNumber(),
        0,
        'no quote should be available if a delegate does not exist'
      )
    })

    it('test a successful call - getMaxQuote', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await delegate.getMaxQuote.call(SENDER_TOKEN, SIGNER_TOKEN)

      equal(
        val[0].toNumber(),
        MAX_SENDER_AMOUNT,
        'no quote should be available if a peer does not exist'
      )

      let expectedValue = Math.floor(
        (MAX_SENDER_AMOUNT * PRICE_COEF) / 10 ** EXP
      )
      equal(
        val[1].toNumber(),
        expectedValue,
        'no quote should be available if a delegate does not exist'
      )
    })
  })

  describe('Test provideOrder', async () => {
    it('test if a rule does not exist', async () => {
      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: 555,
          token: SENDER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: 999,
          token: SIGNER_TOKEN,
        },
      })

      await reverted(
        delegate.provideOrder(order, {
          from: notOwner,
        }),
        'TOKEN_PAIR_INACTIVE'
      )
    })

    it('test if an order exceeds maximum amount', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: 555,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: MAX_SENDER_AMOUNT + 1,
          token: SENDER_TOKEN,
        },
      })

      await reverted(
        delegate.provideOrder(order, {
          from: notOwner,
        }),
        'AMOUNT_EXCEEDS_MAX'
      )
    })

    it('test if the sender is not empty and not the trade wallet', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let signerAmount = 100
      let senderAmount = Math.floor((signerAmount * 10 ** EXP) / PRICE_COEF)

      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: signerAmount,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: notTradeWallet,
          param: senderAmount,
          token: SENDER_TOKEN,
        },
      })

      await reverted(
        delegate.provideOrder(order, {
          from: notOwner,
        }),
        'INVALID_SENDER_WALLET'
      )
    })

    it('test if order is not priced according to the rule', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      const order = await orders.getOrder({
        signer: {
          param: 30,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: MAX_SENDER_AMOUNT,
          token: SENDER_TOKEN,
        },
      })

      await reverted(
        delegate.provideOrder(order, {
          from: notOwner,
        })
      )
    })

    it('test a successful transaction with integer values', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        100,
        EXP
      )

      let ruleBefore = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)

      let signerAmount = 100

      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: signerAmount,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: 100,
          token: SENDER_TOKEN,
        },
      })

      await passes(
        //mock swapContract
        //test rule decrement
        delegate.provideOrder(order, {
          from: notOwner,
        })
      )

      let ruleAfter = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        ruleBefore[0].toNumber() - signerAmount,
        "rule's max peer amount was not decremented"
      )

      //check if swap() was called
      let invocationCount = await mockSwap.invocationCountForMethod.call(
        swapFunction
      )
      equal(
        invocationCount,
        1,
        'swap function was not called the expected number of times'
      )
    })

    it('test a successful transaction with trade wallet as sender', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        100,
        EXP
      )

      let ruleBefore = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)

      let signerAmount = 100

      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: signerAmount,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: 100,
          token: SENDER_TOKEN,
        },
      })

      await passes(
        //mock swapContract
        //test rule decrement
        delegate.provideOrder(order, {
          from: notOwner,
        })
      )

      let ruleAfter = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        ruleBefore[0].toNumber() - signerAmount,
        "rule's max delegate amount was not decremented"
      )

      //check if swap() was called
      let invocationCount = await mockSwap.invocationCountForMethod.call(
        swapFunction
      )
      equal(
        invocationCount,
        1,
        'swap function was not called the expected number of times'
      )
    })

    it('test a successful transaction with decimal values', async () => {
      await delegate.setRule(
        SENDER_TOKEN,
        SIGNER_TOKEN,
        MAX_SENDER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let ruleBefore = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)

      let signerAmount = 100
      let senderAmount = Math.floor((signerAmount * 10 ** EXP) / PRICE_COEF)

      const order = await orders.getOrder({
        signer: {
          wallet: notOwner,
          param: signerAmount,
          token: SIGNER_TOKEN,
        },
        sender: {
          wallet: tradeWallet,
          param: senderAmount,
          token: SENDER_TOKEN,
        },
      })

      await passes(
        //mock swapContract
        //test rule decrement
        delegate.provideOrder(order, {
          from: notOwner,
        })
      )

      let ruleAfter = await delegate.rules.call(SENDER_TOKEN, SIGNER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        ruleBefore[0].toNumber() - senderAmount,
        "rule's max delegate amount was not decremented"
      )
    })
  })
})
