import { MissingFieldError } from '../domain/errors.ts'
import {
  type AssetMeta,
  type Holding,
  type Price,
  type Snapshot,
  snapshot,
} from '../domain/portfolio.ts'

/** Solde brut non traduit en actif suivi (poussière ou actif non suivi), conservé pour journalisation. */
export interface RawBalance {
  readonly krakenCode: string
  readonly rawBalance: string
}

/** Référence brute d'un actif suivi : code Kraken d'origine et solde rendu par l'API. */
export interface ReferenceBalance {
  readonly asset: string
  readonly krakenCode: string
  readonly rawBalance: string
}

/**
 * Résultat d'une observation de portefeuille : snapshot du domaine, fraîcheur par source
 * (soldes, prix) et soldes bruts non traduits, portés par l'adaptateur vers le cas d'usage.
 */
export interface ObservedSnapshot {
  readonly snapshot: Snapshot
  readonly balancesObservedAt: string
  readonly pricesObservedAt: string
  readonly dust?: readonly RawBalance[]
  readonly untracked?: readonly RawBalance[]
  readonly references?: readonly ReferenceBalance[]
}

/**
 * Port applicatif d'observation d'un portefeuille : implémenté par les adaptateurs
 * (replay, live), consommé par les cas d'usage. Aucune dépendance à un exchange (ADR-0001).
 */
export interface PortfolioSource {
  observe(): Promise<ObservedSnapshot>
}

/** Forme ISO 8601 acceptée : date, heure, fraction de seconde optionnelle, Z ou offset ±HH:MM. */
const ISO_8601_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/

const ATTENDU_HORODATAGE = 'horodatage ISO 8601 UTC (forme canonique Z, à la milliseconde)'

/** Convertit un offset textuel (+HH:MM / -HH:MM) en minutes. */
function decalageEnMinutes(offset: string): number {
  const signe = offset.startsWith('-') ? -1 : 1
  const heures = Number(offset.slice(1, 3))
  const minutes = Number(offset.slice(4, 6))
  return signe * (heures * 60 + minutes)
}

/**
 * Normalise un horodatage ISO 8601 vers la forme canonique UTC Z à la milliseconde :
 * l'offset éventuel est converti en UTC, la fraction bornée à la milliseconde.
 * Parse par regex et Date.UTC, sans Intl ni locale ; refus typé sans répéter la valeur soumise.
 */
function horodatageCanonique(raw: string, champ: string): string {
  const match = ISO_8601_TIMESTAMP_PATTERN.exec(raw)
  if (match === null) {
    throw new MissingFieldError(champ, ATTENDU_HORODATAGE)
  }
  const groupe = (index: number): string => {
    const valeur = match[index]
    if (valeur === undefined) {
      throw new MissingFieldError(champ, ATTENDU_HORODATAGE)
    }
    return valeur
  }
  const annee = Number(groupe(1))
  const mois = Number(groupe(2))
  const jour = Number(groupe(3))
  const heure = Number(groupe(4))
  const minute = Number(groupe(5))
  const seconde = Number(groupe(6))
  const fraction = match[7]
  const millisecondes = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'))
  const offset = groupe(8)
  const decalage = offset === 'Z' ? 0 : decalageEnMinutes(offset) * 60_000
  const epoch = Date.UTC(annee, mois - 1, jour, heure, minute, seconde, millisecondes) - decalage
  return new Date(epoch).toISOString()
}

/**
 * Fabrique du port : assemble et valide le snapshot via la fabrique du domaine, retient
 * `snapshot.observedAt` au plus ancien des deux horodatages calculé sur les formes normalisées,
 * et fige le résultat, tableaux compris. Les refus du domaine remontent sans altération.
 */
export function observedSnapshot(input: {
  assets: readonly AssetMeta[]
  holdings: readonly Holding[]
  prices: readonly Price[]
  balancesObservedAt: string
  pricesObservedAt: string
  dust?: readonly RawBalance[]
  untracked?: readonly RawBalance[]
  references?: readonly ReferenceBalance[]
}): ObservedSnapshot {
  const balancesObservedAt = horodatageCanonique(input.balancesObservedAt, 'balancesObservedAt')
  const pricesObservedAt = horodatageCanonique(input.pricesObservedAt, 'pricesObservedAt')
  const observedAt = balancesObservedAt <= pricesObservedAt ? balancesObservedAt : pricesObservedAt
  return Object.freeze({
    snapshot: snapshot({
      assets: input.assets,
      observedAt,
      holdings: input.holdings,
      prices: input.prices,
    }),
    balancesObservedAt,
    pricesObservedAt,
    ...(input.dust === undefined ? {} : { dust: Object.freeze([...input.dust]) }),
    ...(input.untracked === undefined ? {} : { untracked: Object.freeze([...input.untracked]) }),
    ...(input.references === undefined ? {} : { references: Object.freeze([...input.references]) }),
  })
}
