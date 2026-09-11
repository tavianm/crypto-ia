import {
  MissingFieldError,
  MissingPriceError,
  QuoteMismatchError,
  ScaleMismatchError,
} from './errors.ts'

/** Identifiant d'actif validé (marque sur string, ex. BTC). */
export type AssetCode = string & { readonly __assetCode: unique symbol }

/** Valeur monétaire exacte : units entières à l'échelle decimals (valeur = units × 10^-decimals). */
export interface Monetary {
  readonly units: bigint
  readonly decimals: number
}

export interface AssetMeta {
  readonly code: AssetCode
  readonly decimals: number
  readonly quoteCurrency: AssetCode
}

export interface Amount {
  readonly asset: AssetCode
  readonly units: bigint
}

/** Variation signée d'une position, en unités entières de l'actif. */
export interface SignedDelta {
  readonly asset: AssetCode
  readonly units: bigint
  readonly decimals: number
}

export interface Price {
  readonly asset: AssetCode
  readonly quote: AssetCode
  readonly units: bigint
  readonly decimals: number
}

export interface Holding {
  readonly asset: AssetCode
  readonly amount: Amount
}

export interface Snapshot {
  readonly assets: readonly AssetMeta[]
  readonly observedAt: string
  readonly holdings: readonly Holding[]
  readonly prices: readonly Price[]
}

export const ASSET_CODE_PATTERN = /^[A-Z0-9]{2,10}$/
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** Sérialisation canonique d'une valeur monétaire : "<units>e-<decimals>". */
export function canonicalAmount(value: Monetary): string {
  return `${value.units}e-${value.decimals}`
}

export function assetCode(raw: string): AssetCode {
  if (!ASSET_CODE_PATTERN.test(raw)) {
    throw new MissingFieldError(
      'code',
      'identifiant upper-case alphanumérique de 2 à 10 caractères',
    )
  }
  return raw as AssetCode
}

function positiveInteger(raw: number, field: string, max?: number): number {
  if (!Number.isInteger(raw) || raw < 0 || (max !== undefined && raw > max)) {
    const borne = max === undefined ? 'entier positif' : `entier entre 0 et ${max}`
    throw new MissingFieldError(field, borne)
  }
  return raw
}

export function assetMeta(code: string, decimals: number, quoteCurrency: string): AssetMeta {
  const parsedDecimals = positiveInteger(decimals, 'decimals', 18)
  return Object.freeze({
    code: assetCode(code),
    decimals: parsedDecimals,
    quoteCurrency: assetCode(quoteCurrency),
  })
}

export function amount(asset: AssetCode, units: bigint): Amount {
  if (units < 0n) {
    throw new ScaleMismatchError('les unités d’un montant ne peuvent pas être négatives')
  }
  return Object.freeze({ asset, units })
}

export function signedDelta(asset: AssetCode, units: bigint, decimals: number): SignedDelta {
  return Object.freeze({ asset, units, decimals: positiveInteger(decimals, 'decimals', 18) })
}

export function price(meta: AssetMeta, quote: string, units: bigint, decimals: number): Price {
  if (units <= 0n) {
    throw new ScaleMismatchError('le prix doit être strictement positif')
  }
  const parsedDecimals = positiveInteger(decimals, 'price.decimals', 18)
  const parsedQuote = assetCode(quote)
  if (parsedQuote !== meta.quoteCurrency) {
    throw new QuoteMismatchError(meta.code, meta.quoteCurrency)
  }
  return Object.freeze({ asset: meta.code, quote: parsedQuote, units, decimals: parsedDecimals })
}

export function holding(asset: AssetCode, held: Amount): Holding {
  if (held.asset !== asset) {
    throw new ScaleMismatchError('l’actif du montant doit correspondre à la position')
  }
  return Object.freeze({ asset, amount: held })
}

function sortedBy<T extends { readonly asset: AssetCode }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0))
}

/**
 * Construit un snapshot observé : métadonnées triées et uniques, positions et prix cohérents.
 * L'exigence « tout actif détenu ou ciblé possède un prix » est appliquée à la valorisation,
 * pas ici : un snapshot peut observer partiellement les prix.
 */
export function snapshot(input: {
  assets: readonly AssetMeta[]
  observedAt: string
  holdings: readonly Holding[]
  prices: readonly Price[]
}): Snapshot {
  if (!ISO_8601_PATTERN.test(input.observedAt)) {
    throw new MissingFieldError('observedAt', 'horodatage ISO 8601')
  }
  const assets = [...input.assets].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  const metas = new Map(assets.map((a) => [a.code, a]))
  if (metas.size !== assets.length) {
    throw new MissingFieldError('assets', 'codes uniques sans métadonnées conflictuelles')
  }
  const knownCode = (code: AssetCode, where: string): void => {
    if (!metas.has(code)) {
      throw new MissingFieldError('assets', `actif ${code} absent des métadonnées (${where})`)
    }
  }
  for (const h of input.holdings) knownCode(h.asset, 'holdings')
  for (const p of input.prices) {
    knownCode(p.asset, 'prices')
    const meta = metas.get(p.asset)
    if (meta && p.quote !== meta.quoteCurrency) {
      throw new QuoteMismatchError(p.asset, meta.quoteCurrency)
    }
  }
  return Object.freeze({
    assets: Object.freeze(assets),
    observedAt: input.observedAt,
    holdings: Object.freeze(sortedBy(input.holdings)),
    prices: Object.freeze(sortedBy(input.prices)),
  })
}

/** Prix par code ; lève MissingPriceError si un actif demandé n'en possède pas. */
export function priceByCode(snapshot: Snapshot, code: AssetCode): Price {
  const found = snapshot.prices.find((p) => p.asset === code)
  if (!found) throw new MissingPriceError(code)
  return found
}
