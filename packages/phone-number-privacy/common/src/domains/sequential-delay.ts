import {
  EIP712Optional,
  eip712OptionalSchema,
  eip712OptionalType,
  EIP712TypesWithPrimary,
} from '@planq-network/utils/lib/sign-typed-data-utils'
import * as t from 'io-ts'
import { DomainIdentifiers } from './constants'
import { Domain } from './domains'

// Concrete Domain subtypes are only assignable to Domain and EIP712Object when using type instead
// of interface. Otherwise the compiler complains about a missing index signature.
// tslint:disable:interface-over-type-literal

export type SequentialDelayStage = {
  /**
   * How many seconds each batch of attempts in this stage is delayed with
   * respect to the timer.
   */
  delay: number
  /**
   * Whether the timer should be reset between attempts during this stage.
   * Defaults to true.
   */
  resetTimer: EIP712Optional<boolean>
  /**
   * The number of continuous attempts a user gets before the next delay
   * in each repetition of this stage. Defaults to 1.
   */
  batchSize: EIP712Optional<number>
  /**
   * The number of times this stage repeats before continuing to the next stage
   * in the RateLimit array. Defaults to 1.
   */
  repetitions: EIP712Optional<number>
}

export type SequentialDelayDomain = {
  name: DomainIdentifiers.SequentialDelay
  version: '1'
  stages: SequentialDelayStage[]
  /**
   * Optional Planq address against which signed requests must be authenticated.
   * In the case of Cloud Backup, this will be derived from a one-time key stored with the ciphertext.
   * Encoded as a checksummed address with leading "0x".
   */
  address: EIP712Optional<string>
  /**
   * Optional string to distinguish the output of this domain instance from
   * other SequentialDelayDomain instances
   */
  salt: EIP712Optional<string>
}

export type SequentialDelayDomainOptions = {
  /**
   * EIP-712 signature over the entire request by the address specified in the domain.
   * Required if `address` is defined in the domain instance. If `address` is
   * not defined in the domain instance, then a signature must not be provided.
   * Encoded as a hex string with leading 0x.
   */
  signature: EIP712Optional<string>
  /**
   * Used to prevent replay attacks. Required if a signature is provided.
   * Code verifying the signature for rate limiting should check this nonce against a counter of
   * applied requests. E.g. Ensure the nonce is 0 on the first request and 2 on the third.
   */
  nonce: EIP712Optional<number>
}

export interface SequentialDelayDomainState {
  /**
   * Timestamp in seconds since the Unix Epoch to which the next delay should be applied
   * to calculate when a new request will be accepted.
   */
  timer: number
  /** Number of queries that have been accepted for the SequentialDelayDomain instance. */
  counter: number
  /** Whether or not the domain has been disabled. If disabled, no more queries will be served. */
  disabled: boolean
  /** Server timestamp in seconds since the Unix Epoch. */
  now: number
}

export const INITIAL_SEQUENTIAL_DELAY_DOMAIN_STATE: SequentialDelayDomainState = {
  timer: 0,
  counter: 0,
  disabled: false,
  now: 0,
}

/** io-ts schema for encoding and decoding SequentialDelayStage structs */
export const SequentialDelayStageSchema: t.Type<SequentialDelayStage> = t.strict({
  delay: t.number,
  resetTimer: eip712OptionalSchema(t.boolean),
  batchSize: eip712OptionalSchema(t.number),
  repetitions: eip712OptionalSchema(t.number),
})

/** io-ts schema for encoding and decoding SequentialDelayDomain structs */
export const SequentialDelayDomainSchema: t.Type<SequentialDelayDomain> = t.strict({
  name: t.literal(DomainIdentifiers.SequentialDelay),
  version: t.literal('1'),
  stages: t.array(SequentialDelayStageSchema),
  address: eip712OptionalSchema(t.string),
  salt: eip712OptionalSchema(t.string),
})

/** io-ts schema for encoding and decoding SequentialDelayDomainOptions structs */
export const SequentialDelayDomainOptionsSchema: t.Type<SequentialDelayDomainOptions> = t.strict({
  signature: eip712OptionalSchema(t.string),
  nonce: eip712OptionalSchema(t.number),
})

/** io-ts schema for encoding and decoding SequentialDelayDomainState structs */
export const SequentialDelayDomainStateSchema: t.Type<SequentialDelayDomainState> = t.strict({
  timer: t.number,
  counter: t.number,
  disabled: t.boolean,
  now: t.number,
})

export const isSequentialDelayDomain = (domain: Domain): domain is SequentialDelayDomain =>
  domain.name === DomainIdentifiers.SequentialDelay && domain.version === '1'

export const sequentialDelayDomainEIP712Types: EIP712TypesWithPrimary = {
  types: {
    SequentialDelayDomain: [
      { name: 'address', type: 'Optional<address>' },
      { name: 'name', type: 'string' },
      { name: 'salt', type: 'Optional<string>' },
      { name: 'stages', type: 'SequentialDelayStage[]' },
      { name: 'version', type: 'string' },
    ],
    SequentialDelayStage: [
      { name: 'batchSize', type: 'Optional<uint256>' },
      { name: 'delay', type: 'uint256' },
      { name: 'repetitions', type: 'Optional<uint256>' },
      { name: 'resetTimer', type: 'Optional<bool>' },
    ],
    ...eip712OptionalType('address'),
    ...eip712OptionalType('string'),
    ...eip712OptionalType('uint256'),
    ...eip712OptionalType('bool'),
  },
  primaryType: 'SequentialDelayDomain',
}

export const sequentialDelayDomainOptionsEIP712Types: EIP712TypesWithPrimary = {
  types: {
    SequentialDelayDomainOptions: [
      { name: 'nonce', type: 'Optional<uint256>' },
      { name: 'signature', type: 'Optional<string>' },
    ],
    ...eip712OptionalType('string'),
    ...eip712OptionalType('uint256'),
  },
  primaryType: 'SequentialDelayDomainOptions',
}

/** Result values of the sequential delay domain rate limiting function */
export interface SequentialDelayResultAccepted {
  /** Whether or not a request will be accepted at the given time */
  accepted: true
  /** State after applying an additional query against the quota */
  state: SequentialDelayDomainState
}

export interface SequentialDelayResultRejected {
  /** Whether or not a request will be accepted at the given time */
  accepted: false
  /** State after rejecting the request. Should be unchanged. */
  state: SequentialDelayDomainState
  /**
   * Earliest time a request will be accepted at the current stage.
   * Undefined if a request will never be accepted.
   */
  notBefore?: number
}

export type SequentialDelayResult = SequentialDelayResultAccepted | SequentialDelayResultRejected

interface IndexedSequentialDelayStage extends SequentialDelayStage {
  // The attempt number at which the stage begins
  start: number
}

/**
 * Rate limiting predicate for the sequential delay domain
 *
 * @param domain SequentialDelayDomain instance against which the rate limit is being calculated,
 * and which supplied the rate limiting parameters.
 * @param attemptTime The Unix timestamp in seconds when the request was received.
 * @param state The current state of the domain, including the used quota counter and timer values.
 * Defaults to initial state if no state is available (i.e. for first request against the domain).
 */
export const checkSequentialDelayRateLimit = (
  domain: SequentialDelayDomain,
  attemptTime: number,
  state: SequentialDelayDomainState = INITIAL_SEQUENTIAL_DELAY_DOMAIN_STATE
): SequentialDelayResult => {
  // If the domain has been disabled, all queries are to be rejected.
  if (state.disabled) {
    return { accepted: false, state: { ...state, now: attemptTime } }
  }

  const stage = getIndexedStage(domain, state.counter)

  // If the counter is past the last stage (i.e. the domain is permanently out of quota) return early.
  if (!stage) {
    return { accepted: false, state: { ...state, now: attemptTime } }
  }

  const resetTimer = stage.resetTimer.defined ? stage.resetTimer.value : true
  const delay = getDelay(stage, state.counter)
  const notBefore = state.timer + delay

  if (attemptTime < notBefore) {
    return { accepted: false, notBefore, state: { ...state, now: attemptTime } }
  }

  // Request is accepted. Update the state.
  return {
    accepted: true,
    state: {
      counter: state.counter + 1,
      timer: resetTimer ? attemptTime : notBefore,
      disabled: state.disabled,
      now: attemptTime,
    },
  }
}

/**
 * Finds the current stage of the SequentialDelayDomain rate limit for a given attempt number
 *
 * @param domain SequentialDelayDomain instance against which the rate limit is being calculated,
 * and which supplied the rate limiting parameters.
 * @param counter The current attempt number
 */
const getIndexedStage = (
  domain: SequentialDelayDomain,
  counter: number
): IndexedSequentialDelayStage | undefined => {
  // The attempt index marking the beginning of the current stage
  let start = 0
  // The index of the current stage in domain.stages[]
  let index = 0
  // The number of attempts in the current stage
  let attemptsInStage = 0
  while (start <= counter) {
    if (index >= domain.stages.length) {
      // Counter is past the last stage (i.e. the domain is permanently out of quota)
      return undefined
    }
    const stage = domain.stages[index]
    const repetitions = stage.repetitions.defined ? stage.repetitions.value : 1
    const batchSize = stage.batchSize.defined ? stage.batchSize.value : 1
    attemptsInStage = repetitions * batchSize
    start += attemptsInStage
    index++
  }

  start -= attemptsInStage
  index--

  return { ...domain.stages[index], start }
}

/**
 * Finds the delay to enforce for an attempt given its counter (attempt number) and
 * the corresponding stage in the SequentialDelayDomain rate limit.
 *
 * @param stage IndexedSequentialDelayStage The given stage of the SequentialDelayDomain rate limit,
 * extended to include the index of the first attempt in that stage.
 * @param counter The current attempt number
 */
const getDelay = (stage: IndexedSequentialDelayStage, counter: number): number => {
  const batchSize = stage.batchSize.defined ? stage.batchSize.value : 1
  if ((counter - stage.start) % batchSize === 0) {
    return stage.delay
  }
  return 0
}
