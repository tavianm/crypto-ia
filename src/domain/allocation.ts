import { MissingFieldError, MixedQuoteCurrencyError } from './errors.ts'
import { type AssetCode, assetCode, type Monetary, type Snapshot } from './portfolio.ts'
import { valueOfHoldings } from './valuation.ts'

export interface TargetAllocation {
  readonly policyVersion: string
  readonly weights: readonly { readonly asset: AssetCode; readonly weightBps: number }[]
}

export interface FeePolicy {
  readonly policyVersion: string
  readonly bpsPerTrade: number
}

export interface Deviation {
  readonly asset: AssetCode
  readonly currentBps: number
  readonly targetBps: number
  readonly deviationBps: number
  readonly value: Monetary
}

/** Politique de cible versionnée : poids entiers en points de base sommant exactement 10000. */
export function targetAllocation(
  policyVersion: string,
  weights: readonly { asset: string; weightBps: number }[],
): TargetAllocation {
  if (!policyVersion)
    throw new MissingFieldError('policyVersion', 'identifiant de politique non vide')
  const parsed = weights.map((w) => {
    if (!Number.isInteger(w.weightBps) || w.weightBps < 0) {
      throw new MissingFieldError('weightBps', 'entier positif en points de base')
    }
    return Object.freeze({ asset: assetCode(w.asset), weightBps: w.weightBps })
  })
  const sum = parsed.reduce((sum, w) => sum + w.weightBps, 0)
  if (sum !== 10000) {
    throw new MissingFieldError('weights', 'somme exacte de 10000 points de base')
  }
  const sorted = [...parsed].sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0))
  return Object.freeze({ policyVersion, weights: Object.freeze(sorted) })
}

/** Politique de frais versionnée : taux entier en points de base par opération. */
export function feePolicy(policyVersion: string, bpsPerTrade: number): FeePolicy {
  if (!policyVersion)
    throw new MissingFieldError('policyVersion', 'identifiant de politique non vide')
  if (!Number.isInteger(bpsPerTrade) || bpsPerTrade < 0) {
    throw new MissingFieldError('bpsPerTrade', 'entier positif en points de base')
  }
  return Object.freeze({ policyVersion, bpsPerTrade })
}

/** Écarts en points de base entre l'état courant et la cible, pour tout actif détenu ou ciblé.
 * Les actifs détenus exigent un prix (via la valorisation) ; un actif ciblé non détenu
 * n'exige un prix qu'au moment de dimensionner une proposition (simulation). */
export function computeDeviations(snapshot: Snapshot, target: TargetAllocation): Deviation[] {
  const valuation = valueOfHoldings(snapshot)
  const metas = new Map(snapshot.assets.map((a) => [a.code, a]))
  const weights = new Map(target.weights.map((w) => [w.asset, w.weightBps]))
  const codes = [
    ...new Set([...snapshot.holdings.map((h) => h.asset), ...target.weights.map((w) => w.asset)]),
  ].sort()
  const quotes = new Set(
    codes.map((code) => {
      const meta = metas.get(code)
      if (!meta) throw new MissingFieldError('assets', `actif ${code} absent des métadonnées`)
      return meta.quoteCurrency
    }),
  )
  if (quotes.size > 1) throw new MixedQuoteCurrencyError()
  return codes.map((code) => {
    const value = valuation.perAsset.get(code) ?? 0n
    const currentBps = valuation.total === 0n ? 0 : Number((value * 10000n) / valuation.total)
    const targetBps = weights.get(code) ?? 0
    return Object.freeze({
      asset: code,
      currentBps,
      targetBps,
      deviationBps: targetBps - currentBps,
      value: { units: value, decimals: valuation.scale },
    })
  })
}
