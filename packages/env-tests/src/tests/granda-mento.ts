import { sleep } from '@planq-network/base'
import { StableToken } from '@planq-network/contractkit'
import { PlanqTokenWrapper } from '@planq-network/contractkit/lib/wrappers/PlanqTokenWrapper'
import { StableTokenWrapper } from '@planq-network/contractkit/lib/wrappers/StableTokenWrapper'
import { describe, test } from '@jest/globals'
import BigNumber from 'bignumber.js'
import Logger from 'bunyan'
import { EnvTestContext } from '../context'
import {
  fundAccountWithPLQ,
  fundAccountWithStableToken,
  getKey,
  getValidatorKey,
  ONE,
  TestAccounts,
} from '../scaffold'

export function runGrandaMentoTest(context: EnvTestContext, stableTokensToTest: StableToken[]) {
  const planqAmountToFund = ONE.times(61000)
  const stableTokenAmountToFund = ONE.times(61000)

  const planqAmountToSell = ONE.times(60000)
  const stableTokenAmountToSell = ONE.times(60000)

  describe('Granda Mento Test', () => {
    beforeAll(async () => {
      await fundAccountWithPLQ(context, TestAccounts.GrandaMentoExchanger, planqAmountToFund)
    })

    const baseLogger = context.logger.child({ test: 'grandaMento' })

    for (const sellPlanq of [true, false]) {
      for (const stableToken of stableTokensToTest) {
        const sellTokenStr = sellPlanq ? 'PLQ' : stableToken
        const buyTokenStr = sellPlanq ? stableToken : 'PLQ'
        describe(`selling ${sellTokenStr} for ${buyTokenStr}`, () => {
          beforeAll(async () => {
            if (!sellPlanq) {
              await fundAccountWithStableToken(
                context,
                TestAccounts.GrandaMentoExchanger,
                stableTokenAmountToFund,
                stableToken
              )
            }
          })

          let buyToken: PlanqTokenWrapper<any> | StableTokenWrapper
          let sellToken: PlanqTokenWrapper<any> | StableTokenWrapper
          let stableTokenAddress: string
          let sellAmount: BigNumber

          beforeEach(async () => {
            const planqTokenWrapper = await context.kit.contracts.getPlanqToken()
            const stableTokenWrapper = await context.kit.planqTokens.getWrapper(
              stableToken as StableToken
            )
            stableTokenAddress = stableTokenWrapper.address
            if (sellPlanq) {
              buyToken = stableTokenWrapper
              sellToken = planqTokenWrapper
              sellAmount = planqAmountToSell
            } else {
              buyToken = planqTokenWrapper
              sellToken = stableTokenWrapper
              sellAmount = stableTokenAmountToSell
            }
          })

          const createExchangeProposal = async (logger: Logger, fromAddress: string) => {
            const grandaMento = await context.kit.contracts.getGrandaMento()
            const tokenApprovalReceipt = await sellToken
              .approve(grandaMento.address, sellAmount.toFixed())
              .sendAndWaitForReceipt({
                from: fromAddress,
              })
            logger.debug(
              {
                sellAmount,
                sellTokenStr,
                spender: grandaMento.address,
              },
              'Approved GrandaMento to spend sell token'
            )
            const minedTokenApprovalTx = await context.kit.web3.eth.getTransaction(
              tokenApprovalReceipt.transactionHash
            )
            const tokenApprovalPlanqFees = new BigNumber(tokenApprovalReceipt.gasUsed).times(
              minedTokenApprovalTx.gasPrice
            )

            // Some flakiness has been observed after approving, so we sleep
            await sleep(5000)

            const creationTx = await grandaMento.createExchangeProposal(
              context.kit.planqTokens.getContract(stableToken as StableToken),
              sellAmount,
              sellPlanq
            )
            const creationReceipt = await creationTx.sendAndWaitForReceipt({
              from: fromAddress,
            })
            // Some flakiness has been observed after proposing, so we sleep
            await sleep(5000)
            const proposalId =
              creationReceipt.events!.ExchangeProposalCreated.returnValues.proposalId

            logger.debug(
              {
                sellAmount,
                sellPlanq,
                proposalId,
              },
              'Created exchange proposal'
            )
            const minedCreationTx = await context.kit.web3.eth.getTransaction(
              creationReceipt.transactionHash
            )
            const creationPlanqFees = new BigNumber(creationReceipt.gasUsed).times(
              minedCreationTx.gasPrice
            )
            return {
              creationReceipt,
              minedCreationTx,
              proposalId,
              planqFees: tokenApprovalPlanqFees.plus(creationPlanqFees),
            }
          }

          test('exchanger creates and cancels an exchange proposal', async () => {
            const from = await getKey(context.mnemonic, TestAccounts.GrandaMentoExchanger)
            context.kit.connection.addAccount(from.privateKey)
            context.kit.defaultAccount = from.address

            const logger = baseLogger.child({ from: from.address })
            const grandaMento = await context.kit.contracts.getGrandaMento()

            const sellTokenBalanceBeforeCreation = await sellToken.balanceOf(from.address)

            const creationInfo = await createExchangeProposal(logger, from.address)
            let planqFees = creationInfo.planqFees

            const sellTokenBalanceAfterCreation = await sellToken.balanceOf(from.address)

            // If we are looking at the PLQ balance, take the fees spent into consideration.
            const expectedBalanceDifference = sellPlanq ? sellAmount.plus(planqFees) : sellAmount

            expect(
              sellTokenBalanceBeforeCreation.minus(sellTokenBalanceAfterCreation).toString()
            ).toBe(expectedBalanceDifference.toString())

            const cancelReceipt = await grandaMento
              .cancelExchangeProposal(creationInfo.proposalId)
              .sendAndWaitForReceipt({
                from: from.address,
              })
            const minedCancelTx = await context.kit.web3.eth.getTransaction(
              cancelReceipt.transactionHash
            )

            logger.debug(
              {
                proposalId: creationInfo.proposalId,
              },
              'Cancelled exchange proposal'
            )

            planqFees = planqFees.plus(
              new BigNumber(cancelReceipt.gasUsed).times(minedCancelTx.gasPrice)
            )

            const sellTokenBalanceAfterCancel = await sellToken.balanceOf(from.address)
            // If we are looking at the PLQ balance, take the fees spent into consideration.
            const expectedBalance = sellPlanq
              ? sellTokenBalanceBeforeCreation.minus(planqFees)
              : sellTokenBalanceBeforeCreation
            expect(sellTokenBalanceAfterCancel.toString()).toBe(expectedBalance.toString())
          })

          test('exchanger creates and executes an approved exchange proposal', async () => {
            const from = await getKey(context.mnemonic, TestAccounts.GrandaMentoExchanger)
            context.kit.connection.addAccount(from.privateKey)
            context.kit.defaultAccount = from.address

            const logger = baseLogger.child({ from: from.address })

            const grandaMento = await context.kit.contracts.getGrandaMento()

            const sellTokenBalanceBefore = await sellToken.balanceOf(from.address)
            const buyTokenBalanceBefore = await buyToken.balanceOf(from.address)

            const creationInfo = await createExchangeProposal(logger, from.address)

            const approver = await getValidatorKey(context.mnemonic, 0)
            await grandaMento
              .approveExchangeProposal(creationInfo.proposalId)
              .sendAndWaitForReceipt({
                from: approver.address,
              })

            const vetoPeriodSeconds = await grandaMento.vetoPeriodSeconds()
            // Sleep for the veto period, add 5 seconds for extra measure
            const sleepPeriodMs = vetoPeriodSeconds.plus(5).times(1000).toNumber()
            logger.debug(
              {
                sleepPeriodMs,
                vetoPeriodSeconds,
              },
              'Sleeping so the veto period elapses'
            )
            await sleep(sleepPeriodMs)

            // Executing from the approver to avoid needing to calculate additional gas paid
            // by the approver in this test.
            await grandaMento
              .executeExchangeProposal(creationInfo.proposalId)
              .sendAndWaitForReceipt({
                from: approver.address,
              })

            logger.debug(
              {
                proposalId: creationInfo.proposalId,
              },
              'Executed exchange proposal'
            )

            const sellTokenBalanceAfter = await sellToken.balanceOf(from.address)
            let expectedSellTokenBalanceAfter = sellTokenBalanceBefore.minus(sellAmount)
            if (sellPlanq) {
              expectedSellTokenBalanceAfter = expectedSellTokenBalanceAfter.minus(
                creationInfo.planqFees
              )
            }
            expect(sellTokenBalanceAfter.toString()).toBe(expectedSellTokenBalanceAfter.toString())

            const sortedOracles = await context.kit.contracts.getSortedOracles()
            const planqStableTokenRate = (await sortedOracles.medianRate(stableTokenAddress)).rate

            const exchangeRate = sellPlanq
              ? planqStableTokenRate
              : new BigNumber(1).div(planqStableTokenRate)
            const buyAmount = getBuyAmount(exchangeRate, sellAmount, await grandaMento.spread())

            const buyTokenBalanceAfter = await buyToken.balanceOf(from.address)
            let expectedBuyTokenBalanceAfter = buyTokenBalanceBefore.plus(buyAmount)
            if (!sellPlanq) {
              expectedBuyTokenBalanceAfter = expectedBuyTokenBalanceAfter.minus(
                creationInfo.planqFees
              )
            }
            expect(buyTokenBalanceAfter.toString()).toBe(expectedBuyTokenBalanceAfter.toString())
          })
        })
      }
    }
  })
}

// exchangeRate is the price of the sell token quoted in buy token
function getBuyAmount(exchangeRate: BigNumber, sellAmount: BigNumber, spread: BigNumber.Value) {
  return sellAmount.times(new BigNumber(1).minus(spread)).times(exchangeRate)
}
