import { computeDeviations } from '../domain/allocation.ts'
import { DomainError, MissingFieldError } from '../domain/errors.ts'
import {
  createRejectionEntry,
  createSimulationEntry,
  fingerprintInput,
  type JournalEntry,
  type SimulationInput,
} from '../domain/journal.ts'
import type { AssetCode } from '../domain/portfolio.ts'
import { buildReport, type Report } from '../domain/report.ts'
import { simulateDeviations } from '../domain/simulation.ts'
import { valueOfHoldings } from '../domain/valuation.ts'

export type SimulationOutcome =
  | { readonly kind: 'simulated'; readonly report: Report }
  | {
      readonly kind: 'rejection'
      readonly entries: readonly JournalEntry[]
      readonly error: {
        readonly name: string
        readonly field: string | null
        readonly message: string
      }
    }

function targetedQuote(input: SimulationInput): AssetCode {
  const codes = new Set([
    ...input.snapshot.holdings.map((h) => h.asset),
    ...input.targetAllocation.weights.map((w) => w.asset),
  ])
  const quotes = new Set(
    input.snapshot.assets.filter((a) => codes.has(a.code)).map((a) => a.quoteCurrency),
  )
  if (quotes.size !== 1) {
    throw new MissingFieldError(
      'quoteCurrency',
      'une seule devise de cote pour les actifs détenus ou ciblés',
    )
  }
  return [...quotes][0] as AssetCode
}

/**
 * Cas d'usage pur : observation → écarts → propositions simulées → journal → rapport.
 * Aucune I/O ; tout refus du domaine devient une entrée de journal de type rejet,
 * sans jamais exposer la valeur soumise.
 */
export function simulateRebalance(input: SimulationInput): SimulationOutcome {
  try {
    const fingerprint = fingerprintInput(input)
    const deviations = computeDeviations(input.snapshot, input.targetAllocation)
    const valuation = valueOfHoldings(input.snapshot)
    const { proposals, dust } = simulateDeviations(deviations, input.snapshot, input.feePolicy)
    const entry = createSimulationEntry(
      {
        allocationPolicyVersion: input.targetAllocation.policyVersion,
        feePolicyVersion: input.feePolicy.policyVersion,
        observedAt: input.snapshot.observedAt,
        inputFingerprint: fingerprint,
      },
      {
        valuationTotal: `${valuation.total}e-${valuation.scale}`,
        deviations: deviations.length,
        proposals: proposals.length,
        dust,
        feeBps: input.feePolicy.bpsPerTrade,
      },
    )
    const report = buildReport({
      valuation: {
        total: valuation.total,
        scale: valuation.scale,
        quoteCurrency: targetedQuote(input),
        perAsset: valuation.perAsset,
      },
      deviations,
      proposals,
      entries: [entry],
    })
    return { kind: 'simulated', report }
  } catch (error) {
    if (error instanceof DomainError) {
      const fingerprint = safeFingerprint(input)
      return {
        kind: 'rejection',
        entries: [
          createRejectionEntry(
            {
              allocationPolicyVersion: input.targetAllocation.policyVersion,
              feePolicyVersion: input.feePolicy.policyVersion,
              observedAt: input.snapshot.observedAt,
              inputFingerprint: fingerprint,
            },
            { field: error.field, reason: error.name },
          ),
        ],
        error: { name: error.name, field: error.field, message: error.message },
      }
    }
    throw error
  }
}

function safeFingerprint(input: SimulationInput): string {
  try {
    return fingerprintInput(input)
  } catch {
    return ''
  }
}
