import { MissingPriceError, MixedQuoteCurrencyError } from './errors.ts'
import type { AssetCode, Snapshot } from './portfolio.ts'

export interface Valuation {
  readonly perAsset: ReadonlyMap<AssetCode, bigint>
  readonly total: bigint
  /** Échelle commune : toutes les valeurs perAsset/total sont exprimées à 10^-scale en devise de cote. */
  readonly scale: number
}

/** Devise de cote unique des actifs détenus ; divergence → MixedQuoteCurrencyError. */
export function quoteCurrencyOf(snapshot: Snapshot): AssetCode {
  const quotes = new Set(
    snapshot.holdings.map((h) => snapshot.assets.find((a) => a.code === h.asset)?.quoteCurrency),
  )
  if (quotes.size > 1) throw new MixedQuoteCurrencyError()
  return [...quotes][0] as AssetCode
}

/**
 * Valorisation exacte, sans aucune division : échelle commune
 * S = max(decimals des actifs) + max(decimals des prix), et
 * perAsset_i = holdingUnits_i × priceUnits_i × 10^(maxAssetDecimals − assetDecimals_i + maxPriceDecimals − priceDecimals_i).
 */
export function valueOfHoldings(snapshot: Snapshot): Valuation {
  quoteCurrencyOf(snapshot)
  const maxAssetDecimals = snapshot.assets.reduce((max, a) => Math.max(max, a.decimals), 0)
  const maxPriceDecimals = snapshot.prices.reduce((max, p) => Math.max(max, p.decimals), 0)
  const scale = maxAssetDecimals + maxPriceDecimals
  const metas = new Map(snapshot.assets.map((a) => [a.code, a]))
  const prices = new Map(snapshot.prices.map((p) => [p.asset, p]))
  const perAsset = new Map<AssetCode, bigint>()
  for (const h of snapshot.holdings) {
    const p = prices.get(h.asset)
    if (!p) throw new MissingPriceError(h.asset)
    const meta = metas.get(h.asset)
    if (!meta) throw new MissingPriceError(h.asset)
    const factor = 10n ** BigInt(maxAssetDecimals - meta.decimals + maxPriceDecimals - p.decimals)
    perAsset.set(h.asset, h.amount.units * p.units * factor)
  }
  let total = 0n
  for (const value of perAsset.values()) total += value
  return Object.freeze({ perAsset, total, scale })
}
