/**
 * Adaptateur de replay (A3) : rejoue les réponses Kraken enregistrées dans un répertoire de
 * fixtures et les traduit en ObservedSnapshot par le même port que le mode live. Aucun réseau,
 * aucune clé, aucune variable d'environnement : les fichiers `balance-*.json` et `ticker-*.json`
 * sont lus dans l'ordre lexicographique, cartes brutes fusionnées dans cet ordre, pour un
 * snapshot déterministe octet par octet (SC1). Horodatages gelés : les réponses enregistrées
 * n'en portent pas.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MissingFieldError } from '../../domain/errors.ts'
import {
  type ObservedSnapshot,
  observedSnapshot,
  type PortfolioSource,
  type ReferenceBalance,
} from '../../ports/portfolio-source.ts'
import {
  assetOfKrakenCode,
  type TickerEntry,
  translateBalance,
  translateTicker,
} from './translate.ts'

/** Horodatage gelé du replay, forme canonique du port : les fixtures n'en contiennent pas. */
const HORODATAGE_REPLAY = '2026-09-11T00:00:00.000Z'

/** Motifs des noms de fichiers de réponses enregistrées, par point d'API rejoué. */
const BALANCE_FILE_PATTERN = /^balance-.+\.json$/
const TICKER_FILE_PATTERN = /^ticker-.+\.json$/

/**
 * Noms triés lexicographiquement des réponses enregistrées d'un point d'API dans le répertoire :
 * l'ordre de lecture ne dépend jamais de l'ordre du système de fichiers.
 */
function fichiersTries(dir: string, motif: RegExp): string[] {
  let noms: string[]
  try {
    noms = readdirSync(dir)
  } catch {
    throw new MissingFieldError('replay', 'répertoire de réponses enregistrées lisible')
  }
  return noms.filter((nom) => motif.test(nom)).sort()
}

/** Vérifie l'enveloppe { error: [], result: {...} } d'une réponse et rend sa carte brute. */
function extraireResultat(reponse: unknown, nom: string): Record<string, unknown> {
  if (typeof reponse !== 'object' || reponse === null || Array.isArray(reponse)) {
    throw new MissingFieldError(nom, 'objet JSON de forme { error: [], result: {...} }')
  }
  const erreur = (reponse as { error?: unknown }).error
  if (!Array.isArray(erreur)) {
    throw new MissingFieldError(`${nom}.error`, 'tableau de codes Kraken')
  }
  if (erreur.length > 0) {
    throw new MissingFieldError(
      `${nom}.error`,
      'tableau vide — une réponse en erreur n’est pas rejouable',
    )
  }
  const result = (reponse as { result?: unknown }).result
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new MissingFieldError(`${nom}.result`, 'objet de carte brute Kraken')
  }
  return result as Record<string, unknown>
}

/**
 * Lit une réponse enregistrée et vérifie son enveloppe : refus typé citant le nom du fichier
 * fautif, sans jamais répéter le contenu soumis ni de valeur d'environnement.
 */
function lireReponse(chemin: string, nom: string): Record<string, unknown> {
  let brut: string
  try {
    brut = readFileSync(chemin, 'utf8')
  } catch {
    throw new MissingFieldError(nom, 'réponse Kraken enregistrée lisible')
  }
  let reponse: unknown
  try {
    reponse = JSON.parse(brut)
  } catch {
    throw new MissingFieldError(nom, 'JSON valide')
  }
  return extraireResultat(reponse, nom)
}

/** Fusionne les cartes brutes des fichiers triés : une clé d'un fichier suivant écrase la précédente. */
function fusionnerCartes(dir: string, motif: RegExp): Record<string, unknown> {
  const fusion: Record<string, unknown> = {}
  for (const nom of fichiersTries(dir, motif)) {
    Object.assign(fusion, lireReponse(join(dir, nom), nom))
  }
  return fusion
}

/**
 * Références brutes (confrontation exigée par la spec) : pour chaque entrée de la carte fusionnée
 * des soldes, clés triées, dont le code Kraken traduit vers un actif suivi réellement détenu,
 * le code d'origine et le solde brut rendu par l'API. Les soldes nuls sont exclus de fait :
 * la traduction ne produit pas de position pour eux.
 */
function referencesBrutes(
  soldesBruts: Record<string, string>,
  detenus: ReadonlySet<string>,
): ReferenceBalance[] {
  const references: ReferenceBalance[] = []
  for (const krakenCode of Object.keys(soldesBruts).sort()) {
    const actif = assetOfKrakenCode(krakenCode)
    const brut = soldesBruts[krakenCode]
    if (actif === null || brut === undefined || !detenus.has(actif)) {
      continue
    }
    references.push(Object.freeze({ asset: actif, krakenCode, rawBalance: brut }))
  }
  return references
}

/**
 * Fabrique de la source de replay : implémente le port PortfolioSource sur les réponses
 * enregistrées du répertoire donné. Même répertoire → même ObservedSnapshot, octet par octet ;
 * les erreurs de traduction du domaine remontent telles quelles.
 */
export function createReplaySource(dir: string): PortfolioSource {
  return {
    async observe(): Promise<ObservedSnapshot> {
      const soldesBruts = fusionnerCartes(dir, BALANCE_FILE_PATTERN) as Record<string, string>
      const cotesBrutes = fusionnerCartes(dir, TICKER_FILE_PATTERN) as Record<string, TickerEntry>
      const traduction = translateBalance(soldesBruts)
      const references = referencesBrutes(
        soldesBruts,
        new Set<string>(traduction.holdings.map((h) => String(h.asset))),
      )
      return observedSnapshot({
        assets: traduction.metas,
        holdings: traduction.holdings,
        prices: translateTicker(cotesBrutes),
        balancesObservedAt: HORODATAGE_REPLAY,
        pricesObservedAt: HORODATAGE_REPLAY,
        dust: traduction.dust,
        untracked: traduction.untracked,
        references,
      })
    },
  }
}
