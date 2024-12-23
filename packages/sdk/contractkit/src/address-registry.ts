import { Address, NULL_ADDRESS } from '@planq-network/base/lib/address'
import { Connection } from '@planq-network/connect'
import debugFactory from 'debug'
import { PlanqContract, RegisteredContracts, stripProxy } from './base'
import { newRegistry, Registry } from './generated/Registry'

const debug = debugFactory('kit:registry')

// Registry contract is always predeployed to this address
export const REGISTRY_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000ce10'

export class UnregisteredError extends Error {
  constructor(contract: PlanqContract) {
    super(`${contract} not (yet) registered`)
  }
}

/**
 * Planq Core Contract's Address Registry
 *
 * @param connection – an instance of @planq-network/connect {@link Connection}
 */
export class AddressRegistry {
  private readonly registry: Registry
  private readonly cache: Map<PlanqContract, Address> = new Map()

  constructor(readonly connection: Connection) {
    this.cache.set(PlanqContract.Registry, REGISTRY_CONTRACT_ADDRESS)
    this.registry = newRegistry(connection.web3, REGISTRY_CONTRACT_ADDRESS)
  }

  /**
   * Get the address for a `PlanqContract`
   */
  async addressFor(contract: PlanqContract): Promise<Address> {
    if (!this.cache.has(contract)) {
      debug('Fetching address from Registry for %s', contract)
      const address = await this.registry.methods.getAddressForString(stripProxy(contract)).call()

      debug('Fetched address %s', address)
      if (!address || address === NULL_ADDRESS) {
        throw new UnregisteredError(contract)
      }
      this.cache.set(contract, address)
    }
    const cachedAddress = this.cache.get(contract)!
    return cachedAddress
  }

  /**
   * Get the address mapping for known registered contracts
   */
  async addressMapping() {
    await Promise.all(
      RegisteredContracts.map(async (contract) => {
        try {
          await this.addressFor(contract)
        } catch (e) {
          debug(e)
        }
      })
    )
    return this.cache
  }
}
