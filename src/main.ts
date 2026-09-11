import { readFileSync } from 'node:fs'
import { type SimulationOutcome, simulateRebalance } from './app/simulate-rebalance.ts'
import { loadConfig } from './config.ts'
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

if (import.meta.main) {
  try {
    process.exitCode = run(process.argv)
  } catch (error) {
    if (error instanceof DomainError) {
      console.error(`Entrée invalide : ${error.message}`)
    } else {
      console.error(error instanceof Error ? error.message : 'Erreur inattendue.')
    }
    process.exitCode = 1
  }
}
