import { DomainError } from '../domain/errors.ts'
import { canonicalJson, fnv1a64, toHex64 } from '../domain/journal.ts'
import { canonicalAmount, type Snapshot } from '../domain/portfolio.ts'
import { type Valuation, valueOfHoldings } from '../domain/valuation.ts'
import type { ObservedSnapshot, RawBalance, ReferenceBalance } from '../ports/portfolio-source.ts'

/** Provenance de l'observation : rejeu sur réponses enregistrées ou lecture seule signée. */
export type ObservationSource = 's2-kraken-replay' | 's2-kraken-live'

/**
 * Entrée de journal d'observation (S2), miroir du schéma S1 hors `src/domain` :
 * les champs de politique S1 n'ont pas de sens pour une observation et la source y est dédiée.
 * L'id est calculé hors champ id ; le champ fautif est cité, jamais la valeur soumise.
 */
export interface ObservationEntry {
  readonly schemaVersion: '1'
  readonly id: string
  readonly kind: 'observation' | 'observation-rejection'
  readonly source: ObservationSource
  readonly observedAt: string
  readonly inputFingerprint: string
  readonly data: Record<string, unknown>
}

/** Fraîcheur appariée de l'observation : horodatages distincts par source de données. */
export interface ObservationFreshness {
  readonly balancesAt: string
  readonly pricesAt: string
}

/**
 * Rapport d'observation : snapshot du domaine, valorisation S1 réutilisée, soldes bruts
 * non traduits (poussière et actifs non suivis), références brutes des actifs suivis
 * et entrées de journal, jamais silencieux.
 */
export interface ObservationReport {
  readonly kind: 'observed'
  readonly snapshot: Snapshot
  readonly valuation: Valuation
  readonly untracked: readonly RawBalance[]
  readonly dust: readonly RawBalance[]
  /** Références brutes Kraken des actifs suivis (solde rendu par l'API) ; liste vide par défaut. */
  readonly references?: readonly ReferenceBalance[]
  readonly entries: readonly ObservationEntry[]
  readonly freshness: ObservationFreshness
}

/** Résultat du cas d'usage : rapport observé, ou refus du domaine journalisé sans valeur exposée. */
export type ObservationOutcome =
  | { readonly kind: 'observed'; readonly report: ObservationReport }
  | {
      readonly kind: 'observation-rejection'
      readonly entries: readonly ObservationEntry[]
      readonly error: {
        readonly name: string
        readonly field: string | null
        readonly message: string
      }
    }

/**
 * Empreinte de l'observation complète (snapshot + fraîcheur + soldes bruts non traduits) sur sa
 * forme canonique, dans le style de `fingerprintInput` S1 : montants en notation canonique,
 * jamais de valeur brute en clair hors empreinte.
 */
function fingerprintObservation(observed: ObservedSnapshot): string {
  const snap = observed.snapshot
  const metas = new Map(snap.assets.map((a) => [a.code, a]))
  const payload = {
    balancesObservedAt: observed.balancesObservedAt,
    pricesObservedAt: observed.pricesObservedAt,
    dust: observed.dust ?? [],
    untracked: observed.untracked ?? [],
    snapshot: {
      observedAt: snap.observedAt,
      assets: snap.assets.map((a) => ({
        code: a.code,
        decimals: a.decimals,
        quoteCurrency: a.quoteCurrency,
      })),
      holdings: snap.holdings.map((h) => ({
        asset: h.asset,
        units: canonicalAmount({
          units: h.amount.units,
          decimals: metas.get(h.asset)?.decimals ?? 0,
        }),
      })),
      prices: snap.prices.map((p) => ({
        asset: p.asset,
        quote: p.quote,
        units: canonicalAmount({ units: p.units, decimals: p.decimals }),
      })),
    },
  }
  return toHex64(fnv1a64(canonicalJson(payload)))
}

/** Empreinte « sûre » : chaîne vide si l'observation partiellement invalide refuse l'empreinte. */
function safeFingerprint(observed: ObservedSnapshot): string {
  try {
    return fingerprintObservation(observed)
  } catch {
    return ''
  }
}

/** Entrée de journal d'observation ; l'id est calculé hors champ id (pas d'auto-référence). */
function observationEntry(
  header: {
    kind: 'observation' | 'observation-rejection'
    source: ObservationSource
    observedAt: string
    inputFingerprint: string
  },
  data: Record<string, unknown>,
): ObservationEntry {
  const withoutId: Omit<ObservationEntry, 'id'> = {
    schemaVersion: '1',
    kind: header.kind,
    source: header.source,
    observedAt: header.observedAt,
    inputFingerprint: header.inputFingerprint,
    data,
  }
  return Object.freeze({ ...withoutId, id: toHex64(fnv1a64(canonicalJson(withoutId))) })
}

/**
 * Cas d'usage pur : observation → valorisation S1 → journal d'observation → rapport.
 * Aucune I/O ; la poussière et les actifs non suivis sont propagés sans jamais être tues,
 * et tout refus du domaine devient une entrée de rejet qui cite le champ fautif, jamais la valeur.
 */
export function observePortfolio(
  observed: ObservedSnapshot,
  source: ObservationSource = 's2-kraken-replay',
): ObservationOutcome {
  try {
    const fingerprint = fingerprintObservation(observed)
    const valuation = valueOfHoldings(observed.snapshot)
    const dust = observed.dust ?? []
    const untracked = observed.untracked ?? []
    const entry = observationEntry(
      {
        kind: 'observation',
        source,
        observedAt: observed.snapshot.observedAt,
        inputFingerprint: fingerprint,
      },
      { dust, untracked },
    )
    const report: ObservationReport = {
      kind: 'observed',
      snapshot: observed.snapshot,
      valuation,
      untracked,
      dust,
      references: observed.references ?? [],
      entries: Object.freeze([entry]),
      freshness: Object.freeze({
        balancesAt: observed.balancesObservedAt,
        pricesAt: observed.pricesObservedAt,
      }),
    }
    return { kind: 'observed', report: Object.freeze(report) }
  } catch (error) {
    if (error instanceof DomainError) {
      const entry = observationEntry(
        {
          kind: 'observation-rejection',
          source,
          observedAt: observed.snapshot.observedAt,
          inputFingerprint: safeFingerprint(observed),
        },
        { field: error.field, reason: error.name },
      )
      return {
        kind: 'observation-rejection',
        entries: Object.freeze([entry]),
        error: { name: error.name, field: error.field, message: error.message },
      }
    }
    throw error
  }
}
