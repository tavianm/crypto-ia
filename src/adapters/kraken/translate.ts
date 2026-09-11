/**
 * Traduction Kraken (A2) : codes d'actifs et chaînes décimales brutes vers les types du domaine.
 * Catalogue suivi : XXBT/XBT/BTC → BTC (8 décimales), XETH/ETH → ETH (18), SOL → SOL (9),
 * devise de cote USDT. Les variantes suffixées (.B/.F/.T/.S/.M) et tout actif non ciblé restent
 * hors positions suivies. Parse 100 % entier sur chaînes (bigint) : aucun flottant.
 */

import { MissingFieldError, ScaleMismatchError } from '../../domain/errors.ts'
import {
  type AssetMeta,
  amount,
  assetMeta,
  type Holding,
  holding,
  type Price,
  price,
} from '../../domain/portfolio.ts'
import type { RawBalance } from '../../ports/portfolio-source.ts'

/** Devise de cote unique du périmètre observé. */
const QUOTE = 'USDT'

/** Échelle de prix maximale acceptée par le domaine. */
const PRICE_SCALE_MAX = 18

/** Forme attendue d'une chaîne décimale Kraken : chiffres seuls, séparateur optionnel, pas de signe. */
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/

/** Description du format attendu, citée dans les refus sans jamais répéter la valeur soumise. */
const ATTENDU_DECIMAL = 'chaîne décimale exacte de la forme ^\\d+(\\.\\d+)?$'

const META_BTC = assetMeta('BTC', 8, QUOTE)
const META_ETH = assetMeta('ETH', 18, QUOTE)
const META_SOL = assetMeta('SOL', 9, QUOTE)

/** Métadonnées du catalogue suivi, triées par code. */
const METAS: readonly AssetMeta[] = [META_BTC, META_ETH, META_SOL]

/** Catalogue des codes Kraken suivis : formes préfixées et nues vers la méta du domaine. */
const CATALOGUE: ReadonlyMap<string, AssetMeta> = new Map<string, AssetMeta>([
  ['XXBT', META_BTC],
  ['XBT', META_BTC],
  ['BTC', META_BTC],
  ['XETH', META_ETH],
  ['ETH', META_ETH],
  ['SOL', META_SOL],
])

/**
 * Traduction d'une carte de soldes Kraken : positions suivies, actifs hors suivi, catalogue
 * et poussière. Les prix sont traduits séparément par translateTicker et assemblés en amont.
 */
export interface TranslationResult {
  readonly holdings: readonly Holding[]
  /** Actifs non ciblés non nuls (cash USDT, variantes suffixées, actifs hors catalogue). */
  readonly untracked: readonly RawBalance[]
  readonly metas: readonly AssetMeta[]
  /** Excédents d'échelle tronqués vers zéro, journalisés et jamais silencieux. */
  readonly dust: readonly RawBalance[]
}

/** Cote publique d'une paire : seule la dernière transaction c[0] est consommée. */
export interface TickerEntry {
  readonly c: readonly string[]
}

/** Valeur décimale exacte d'une chaîne : chiffres entiers et échelle de la chaîne source. */
interface DecimalExact {
  readonly units: bigint
  readonly scale: number
}

/** Ordre déterministe des entrées d'une carte brute, indépendant de l'ordre d'insertion. */
function compareCles(a: readonly [string, unknown], b: readonly [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
}

/**
 * Parse une chaîne décimale exacte sans flottant : chiffres concaténés en bigint, échelle égale
 * au nombre de décimales de la chaîne. Toute autre forme produit un refus typé du domaine.
 */
function parseDecimalExact(raw: string, champ: string): DecimalExact {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new MissingFieldError(champ, ATTENDU_DECIMAL)
  }
  const parties = raw.split('.')
  const entiere = parties[0] ?? ''
  const fraction = parties[1] ?? ''
  return { units: BigInt(entiere + fraction), scale: fraction.length }
}

/**
 * Ramène une valeur à l'échelle cible de l'actif : zéros de fin ignorés, excédent non nul
 * tronqué vers zéro (jamais arrondi) et signalé par `excedent`, jamais silencieux.
 */
function tronquerVersZero(
  units: bigint,
  scale: number,
  cible: number,
): { readonly units: bigint; readonly excedent: boolean } {
  const ecart = scale - cible
  if (ecart <= 0) {
    return { units: units * 10n ** BigInt(-ecart), excedent: false }
  }
  const facteur = 10n ** BigInt(ecart)
  return { units: units / facteur, excedent: units % facteur !== 0n }
}

/** Traduit une clé de paire (ex. XBTUSDT) vers la méta de l'actif suivi coté en USDT. */
function metaDePaire(pair: string): AssetMeta {
  if (!pair.endsWith(QUOTE)) {
    throw new MissingFieldError('pair', `paire cotée en ${QUOTE}`)
  }
  const base = pair.slice(0, pair.length - QUOTE.length)
  const meta = CATALOGUE.get(base)
  if (meta === undefined) {
    throw new MissingFieldError('pair', `paire cotée en ${QUOTE} sur un actif du catalogue`)
  }
  return meta
}

/**
 * Traduit une carte de soldes Kraken selon la politique deux niveaux : soldes nuls ignorés ;
 * actifs non ciblés non nuls (cash USDT, variantes suffixées, hors catalogue) en `untracked`,
 * non bloquant ; actifs suivis rendus à l'échelle du catalogue, excédent non nul tronqué vers
 * zéro et listé dans `dust`. Toute chaîne non décimale produit un refus typé du domaine citant
 * le champ sans la valeur soumise.
 */
export function translateBalance(raw: Record<string, string>): TranslationResult {
  const holdings: Holding[] = []
  const untracked: RawBalance[] = []
  const dust: RawBalance[] = []
  for (const [krakenCode, brut] of Object.entries(raw).sort(compareCles)) {
    const solde = parseDecimalExact(brut, `balance.${krakenCode}`)
    if (solde.units === 0n) {
      continue
    }
    const meta = CATALOGUE.get(krakenCode)
    if (meta === undefined) {
      untracked.push(Object.freeze({ krakenCode, rawBalance: brut }))
      continue
    }
    const traduit = tronquerVersZero(solde.units, solde.scale, meta.decimals)
    holdings.push(holding(meta.code, amount(meta.code, traduit.units)))
    if (traduit.excedent) {
      dust.push(Object.freeze({ krakenCode, rawBalance: brut }))
    }
  }
  return Object.freeze({
    holdings: Object.freeze(holdings),
    untracked: Object.freeze(untracked),
    metas: Object.freeze([...METAS]),
    dust: Object.freeze(dust),
  })
}

/**
 * Traduit une carte de cotes Kraken en prix du domaine : la clé de paire est traduite vers
 * l'actif suivi (traduction distincte de celle des codes de solde) et c[0] est parsé exactement
 * à l'échelle de la chaîne (bornée à 18 décimales). Aucune troncature sur les prix : la
 * re-sérialisation canonique reproduit la valeur source sans perte.
 */
export function translateTicker(raw: Record<string, TickerEntry>): readonly Price[] {
  const prix: Price[] = []
  for (const [pair, cote] of Object.entries(raw).sort(compareCles)) {
    const meta = metaDePaire(pair)
    const brut = cote.c[0]
    if (brut === undefined) {
      throw new MissingFieldError('price', 'dernière cote c[0] présente')
    }
    const cours = parseDecimalExact(brut, 'price')
    if (cours.scale > PRICE_SCALE_MAX) {
      throw new ScaleMismatchError(`échelle de prix bornée à ${PRICE_SCALE_MAX} décimales`)
    }
    prix.push(price(meta, QUOTE, cours.units, cours.scale))
  }
  return Object.freeze(prix)
}

/**
 * Retourne le code domaine d'un code Kraken d'actif suivi (XXBT/XBT/BTC → BTC, XETH/ETH → ETH,
 * SOL → SOL), ou null pour tout autre code : devise de cote, variantes suffixées, actifs hors
 * catalogue. Sert à l'adaptateur de replay pour relier chaque entrée brute de solde à la
 * position traduite qui la représente.
 */
export function assetOfKrakenCode(rawCode: string): string | null {
  const meta = CATALOGUE.get(rawCode)
  return meta === undefined ? null : meta.code
}
