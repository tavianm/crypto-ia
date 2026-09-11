import { readFileSync } from 'node:fs'
import { createKrakenClient, type KrakenClient } from './adapters/kraken/client.ts'
import { createReplaySource } from './adapters/kraken/replay.ts'
import {
  assetOfKrakenCode,
  translateBalance,
  translateTicker,
} from './adapters/kraken/translate.ts'
import { type ObservationSource, observePortfolio } from './app/observe-portfolio.ts'
import { renderObservationReport } from './app/observe-report.ts'
import { type SimulationOutcome, simulateRebalance } from './app/simulate-rebalance.ts'
import { loadConfig, loadObserveConfig } from './config.ts'
import { DomainError, MissingFieldError } from './domain/errors.ts'
import {
  amount,
  assetCode,
  assetMeta,
  feePolicy,
  holding,
  price,
  snapshot,
  targetAllocation,
} from './domain/index.ts'
import { canonicalJson } from './domain/journal.ts'
import { renderReport } from './domain/report.ts'
import {
  type ObservedSnapshot,
  observedSnapshot,
  type PortfolioSource,
  type ReferenceBalance,
} from './ports/portfolio-source.ts'

const DEFAULT_INPUT = 'fixtures/s1-synthetic-portfolio.json'

function parseUnits(raw: unknown, field: string): bigint {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new MissingFieldError(field, 'unités entières en chaîne décimale')
  }
  return BigInt(raw)
}

function parseObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MissingFieldError(field, 'objet JSON')
  }
  return value as Record<string, unknown>
}

function requireField(value: Record<string, unknown>, field: string): unknown {
  if (!(field in value) || value[field] === undefined) {
    throw new MissingFieldError(field, 'champ présent')
  }
  return value[field]
}

/** Charge et valide le jeu d'entrée via les fabriques du domaine (seule I/O disque de la composition). */
export function loadInput(path: string = DEFAULT_INPUT): ReturnType<typeof buildInput> {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new MissingFieldError('input', 'JSON lisible')
  }
  return buildInput(parseObject(raw, 'input'))
}

function buildInput(raw: Record<string, unknown>) {
  const rawAssets = requireField(raw, 'assets')
  if (!Array.isArray(rawAssets)) throw new MissingFieldError('assets', 'tableau de métadonnées')
  const assets = rawAssets.map((a) => {
    const meta = parseObject(a, 'assets[]')
    return assetMeta(
      String(requireField(meta, 'code')),
      Number(requireField(meta, 'decimals')),
      String(requireField(meta, 'quoteCurrency')),
    )
  })
  const rawSnapshot = parseObject(requireField(raw, 'snapshot'), 'snapshot')
  const rawHoldings = requireField(rawSnapshot, 'holdings')
  if (!Array.isArray(rawHoldings))
    throw new MissingFieldError('snapshot.holdings', 'tableau de positions')
  const holdings = rawHoldings.map((h) => {
    const item = parseObject(h, 'snapshot.holdings[]')
    const code = assetCode(String(requireField(item, 'asset')))
    return holding(
      code,
      amount(code, parseUnits(requireField(item, 'units'), 'snapshot.holdings[].units')),
    )
  })
  const rawPrices = requireField(rawSnapshot, 'prices')
  if (!Array.isArray(rawPrices)) throw new MissingFieldError('snapshot.prices', 'tableau de prix')
  const prices = rawPrices.map((p) => {
    const item = parseObject(p, 'snapshot.prices[]')
    const code = assetCode(String(requireField(item, 'asset')))
    const meta = assets.find((m) => m.code === code)
    if (!meta) throw new MissingFieldError('assets', `actif ${code} absent des métadonnées`)
    return price(
      meta,
      String(requireField(item, 'quote')),
      parseUnits(requireField(item, 'units'), 'snapshot.prices[].units'),
      Number(requireField(item, 'decimals')),
    )
  })
  const snap = snapshot({
    assets,
    observedAt: String(requireField(rawSnapshot, 'observedAt')),
    holdings,
    prices,
  })
  const rawTarget = parseObject(requireField(raw, 'targetAllocation'), 'targetAllocation')
  const rawWeights = requireField(rawTarget, 'weights')
  if (!Array.isArray(rawWeights))
    throw new MissingFieldError('targetAllocation.weights', 'tableau de poids')
  const target = targetAllocation(
    String(requireField(rawTarget, 'policyVersion')),
    rawWeights.map((w) => {
      const item = parseObject(w, 'targetAllocation.weights[]')
      return {
        asset: String(requireField(item, 'asset')),
        weightBps: Number(requireField(item, 'weightBps')),
      }
    }),
  )
  const rawFees = parseObject(requireField(raw, 'feePolicy'), 'feePolicy')
  const fees = feePolicy(
    String(requireField(rawFees, 'policyVersion')),
    Number(requireField(rawFees, 'bpsPerTrade')),
  )
  return { snapshot: snap, targetAllocation: target, feePolicy: fees }
}

function inputPath(argv: readonly string[]): string {
  const flagIndex = argv.indexOf('--input')
  if (flagIndex === -1) return DEFAULT_INPUT
  const value = argv[flagIndex + 1]
  if (!value || value.startsWith('--')) {
    throw new MissingFieldError('--input', 'chemin de fixture')
  }
  return value
}

function run(argv: readonly string[]): number {
  loadConfig(process.env)
  const outcome: SimulationOutcome = simulateRebalance(loadInput(inputPath(argv)))
  if (outcome.kind === 'rejection') {
    console.log(canonicalJson({ kind: outcome.kind, entries: outcome.entries }))
    console.error(`Simulation refusée : ${outcome.error.message}`)
    return 1
  }
  console.log(renderReport(outcome.report))
  return 0
}

/** Paires de cote publiques demandées à Kraken : une paire USDT par actif suivi du catalogue. */
const PAIRES_COTE = ['XBTUSDT', 'ETHUSDT', 'SOLUSDT']

/**
 * Références brutes (confrontation exigée par la spec) : pour chaque code Kraken de la carte
 * brute des soldes, trié, dont le code traduit vers un actif suivi réellement détenu, le code
 * d'origine et le solde brut rendu par l'API — même logique que l'adaptateur de replay.
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
 * Source live composée en ligne : soldes privés signés puis cotes publiques, horodatés à
 * réception de chaque réponse, traduits par le même chemin que le replay. Lecture seule :
 * aucune écriture, aucune requête hors les deux points d'API observés.
 */
function creerSourceLive(client: KrakenClient): PortfolioSource {
  return {
    async observe(): Promise<ObservedSnapshot> {
      const soldesBruts = await client.fetchBalance()
      const balancesObservedAt = new Date().toISOString()
      const cotesBrutes = await client.fetchTicker(PAIRES_COTE)
      const pricesObservedAt = new Date().toISOString()
      const traduction = translateBalance(soldesBruts)
      return observedSnapshot({
        assets: traduction.metas,
        holdings: traduction.holdings,
        prices: translateTicker(cotesBrutes),
        balancesObservedAt,
        pricesObservedAt,
        dust: traduction.dust,
        untracked: traduction.untracked,
        references: referencesBrutes(
          soldesBruts,
          new Set<string>(traduction.holdings.map((h) => String(h.asset))),
        ),
      })
    },
  }
}

/** Valeur du flag --replay, ou undefined ; valeur manquante → refus typé citant le flag, sans valeur. */
function repertoireReplay(argv: readonly string[]): string | undefined {
  const flagIndex = argv.indexOf('--replay')
  if (flagIndex === -1) return undefined
  const value = argv[flagIndex + 1]
  if (!value || value.startsWith('--')) {
    throw new MissingFieldError('--replay', 'répertoire de réponses enregistrées')
  }
  return value
}

/** Exécute une observation complète : cas d'usage pur, puis rapport ou rejet journalisé. */
async function observationDepuis(
  source: PortfolioSource,
  sourceId: ObservationSource,
): Promise<number> {
  const outcome = observePortfolio(await source.observe(), sourceId)
  if (outcome.kind === 'observation-rejection') {
    console.log(canonicalJson({ kind: outcome.kind, entries: outcome.entries }))
    console.error(`Observation refusée : ${outcome.error.message}`)
    return 1
  }
  console.log(renderObservationReport(outcome.report))
  return 0
}

/**
 * Flux observe : replay sur réponses enregistrées, ou source live composée en ligne sur clés de
 * lecture seule. Les échecs de configuration, transport ou API remontent au catch global.
 */
async function runObserve(argv: readonly string[]): Promise<number> {
  const replayDir = repertoireReplay(argv)
  const config = loadObserveConfig(process.env, replayDir === undefined ? undefined : { replayDir })
  if (config.replayDir !== undefined) {
    return observationDepuis(createReplaySource(config.replayDir), 's2-kraken-replay')
  }
  const kraken = config.kraken
  if (kraken === null) {
    throw new Error(
      'KRAKEN_API_KEY/KRAKEN_API_SECRET: aucune clé de lecture seule fournie et aucun répertoire de replay.',
    )
  }
  return observationDepuis(
    creerSourceLive(
      createKrakenClient({ apiKey: kraken.apiKey, apiSecretBase64: kraken.apiSecretBase64 }),
    ),
    's2-kraken-live',
  )
}

/** Message d'échec unique : refus du domaine préfixé, sinon message brut, sans valeur d'environnement. */
function consignerEchec(error: unknown): number {
  if (error instanceof DomainError) {
    console.error(`Entrée invalide : ${error.message}`)
  } else {
    console.error(error instanceof Error ? error.message : 'Erreur inattendue.')
  }
  return 1
}

if (import.meta.main) {
  const argv = process.argv
  // Sous-commande détectée par égalité d'argument : jamais par sous-chaîne, un chemin de
  // script ou de fixture contenant « observe » ne doit pas basculer le flux S1.
  if (argv.includes('observe')) {
    runObserve(argv)
      .then((code) => {
        process.exitCode = code
      })
      .catch((error) => {
        process.exitCode = consignerEchec(error)
      })
  } else {
    try {
      process.exitCode = run(argv)
    } catch (error) {
      process.exitCode = consignerEchec(error)
    }
  }
}
