import { type Deviation, type FeePolicy, feePolicy as newFeePolicy } from './allocation.ts'
import { MissingFieldError, MissingPriceError } from './errors.ts'
import { type AssetCode, canonicalAmount, type Snapshot } from './portfolio.ts'

export type { FeePolicy } from './allocation.ts'
export { feePolicy } from './allocation.ts'

export interface Proposal {
  readonly kind: 'simulated'
  readonly asset: AssetCode
  readonly signedDelta: {
    readonly asset: AssetCode
    readonly units: bigint
    readonly decimals: number
  }
  readonly deltaValue: { readonly units: bigint; readonly decimals: number }
  readonly estimatedFee: { readonly units: bigint; readonly decimals: number }
  readonly reason: string
}

export interface DustEntry {
  readonly asset: AssetCode | null
  readonly field: 'deltaUnits' | 'currentBps'
  /** Reste non représentable : valeur en devise de cote (chaîne canonique) ou points de base (nombre). */
  readonly remainder: string | number
}

export interface SimulationResult {
  readonly proposals: readonly Proposal[]
  readonly dust: readonly DustEntry[]
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

/**
 * Propose des opérations simulées pour ramener chaque actif à sa cible.
 * Arrondi déterministe par troncature vers zéro ; tout reste non représentable
 * est journalisé comme poussière, jamais silencieusement abandonné.
 */
export function simulateDeviations(
  deviations: readonly Deviation[],
  snapshot: Snapshot,
  fees: FeePolicy,
): SimulationResult {
  newFeePolicy(fees.policyVersion, fees.bpsPerTrade)
  const metas = new Map(snapshot.assets.map((a) => [a.code, a]))
  const prices = new Map(snapshot.prices.map((p) => [p.asset, p]))
  const total = deviations.reduce((sum, d) => sum + d.value.units, 0n)
  const scale = deviations[0]?.value.decimals ?? 0
  const proposals: Proposal[] = []
  const dust: DustEntry[] = []
  const currentBpsSum = deviations.reduce((sum, d) => sum + d.currentBps, 0)
  if (total !== 0n && currentBpsSum !== 10000) {
    dust.push(Object.freeze({ asset: null, field: 'currentBps', remainder: 10000 - currentBpsSum }))
  }
  for (const deviation of deviations) {
    const targetValue = (total * BigInt(deviation.targetBps)) / 10000n
    const deltaValue = targetValue - deviation.value.units
    if (deltaValue === 0n) continue
    const price = prices.get(deviation.asset)
    if (!price) throw new MissingPriceError(deviation.asset)
    const meta = metas.get(deviation.asset)
    if (!meta)
      throw new MissingFieldError('assets', `actif ${deviation.asset} absent des métadonnées`)
    const priceAtScale = price.units * 10n ** BigInt(scale - meta.decimals - price.decimals)
    const deltaUnits = deltaValue / priceAtScale
    if (deltaUnits === 0n) {
      dust.push(
        Object.freeze({
          asset: deviation.asset,
          field: 'deltaUnits',
          remainder: canonicalAmount({ units: deltaValue, decimals: scale }),
        }),
      )
      continue
    }
    const feeUnits = (abs(deltaValue) * BigInt(fees.bpsPerTrade)) / 10000n
    proposals.push(
      Object.freeze({
        kind: 'simulated',
        asset: deviation.asset,
        signedDelta: { asset: deviation.asset, units: deltaUnits, decimals: meta.decimals },
        deltaValue: { units: deltaValue, decimals: scale },
        estimatedFee: { units: feeUnits, decimals: scale },
        reason: `écart de ${deviation.deviationBps} bps à la cible`,
      }),
    )
  }
  return { proposals: Object.freeze(proposals), dust: Object.freeze(dust) }
}
