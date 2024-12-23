import { Address, PlanqTransactionObject } from '@planq-network/connect'
import { BigNumber } from 'bignumber.js'
import { OdisPayments } from '../generated/OdisPayments'
import { BaseWrapper, proxyCall, proxySend, valueToBigNumber } from './BaseWrapper'

export class OdisPaymentsWrapper extends BaseWrapper<OdisPayments> {
  /**
   * @notice Fetches total amount sent (all-time) for given account to odisPayments
   * @param account The account to fetch total amount of funds sent
   */
  totalPaidCUSD: (account: Address) => Promise<BigNumber> = proxyCall(
    this.contract.methods.totalPaidCUSD,
    undefined,
    valueToBigNumber
  )

  /**
   * @notice Sends pUSD to this contract to pay for ODIS quota (for queries).
   * @param account The account whose balance to increment.
   * @param value The amount in pUSD to pay.
   * @dev Throws if pUSD transfer fails.
   */
  payInCUSD: (account: Address, value: number | string) => PlanqTransactionObject<void> = proxySend(
    this.connection,
    this.contract.methods.payInCUSD
  )
}

export type OdisPaymentsWrapperType = OdisPaymentsWrapper
