import type { Deviation } from './allocation.ts'
import type { JournalEntry } from './journal.ts'
import { canonicalJson } from './journal.ts'
import { type AssetCode, canonicalAmount, type Monetary } from './portfolio.ts'
import type { Proposal } from './simulation.ts'

export interface Report {
  readonly kind: 'simulated'
  readonly valuation: {
    readonly total: Monetary
    readonly scale: number
    readonly quoteCurrency: AssetCode
    readonly perAsset: readonly { readonly asset: AssetCode; readonly value: Monetary }[]
  }
  readonly deviations: readonly Deviation[]
  readonly proposals: readonly Proposal[]
  readonly entries: readonly JournalEntry[]
}

/** Décimal exact sans Intl : troncature vers zéro, zéros fractionnaires finaux retirés. */
export function formatDecimal(units: bigint, decimals: number): string {
  const negative = units < 0n
  const magnitude = negative ? -units : units
  const scale = 10n ** BigInt(decimals)
  const whole = magnitude / scale
  const fraction = (magnitude % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  const body = fraction ? `${whole}.${fraction}` : whole.toString()
  return negative && magnitude !== 0n ? `-${body}` : body
}

function toPlain(report: Report): Record<string, unknown> {
  return {
    kind: report.kind,
    valuation: {
      total: canonicalAmount(report.valuation.total),
      scale: report.valuation.scale,
      quoteCurrency: report.valuation.quoteCurrency,
      perAsset: report.valuation.perAsset.map((entry) => ({
        asset: entry.asset,
        value: canonicalAmount(entry.value),
      })),
    },
    deviations: report.deviations.map((d) => ({
      asset: d.asset,
      currentBps: d.currentBps,
      targetBps: d.targetBps,
      deviationBps: d.deviationBps,
      value: canonicalAmount(d.value),
    })),
    proposals: report.proposals.map((p) => ({
      kind: p.kind,
      asset: p.asset,
      signedDelta: `${p.signedDelta.units}e-${p.signedDelta.decimals}`,
      deltaValue: canonicalAmount(p.deltaValue),
      estimatedFee: canonicalAmount(p.estimatedFee),
      reason: p.reason,
    })),
    entries: report.entries,
  }
}

function textSummary(report: Report): string {
  const deviations = report.deviations
    .map(
      (d) =>
        `${d.asset} ${d.currentBps}→${d.targetBps} bps (écart ${d.deviationBps}, valeur ${formatDecimal(d.value.units, d.value.decimals)})`,
    )
    .join(' | ')
  const proposals = report.proposals.length
    ? report.proposals
        .map(
          (p) =>
            `${p.asset} ${p.signedDelta.units < 0n ? 'vente' : 'achat'} ${p.signedDelta.units}e-${p.signedDelta.decimals} (frais ${formatDecimal(p.estimatedFee.units, p.estimatedFee.decimals)})`,
        )
        .join(' | ')
    : 'aucune'
  return [
    `# Rapport simulé (shadow) — ${report.valuation.quoteCurrency} — total ${formatDecimal(report.valuation.total.units, report.valuation.total.decimals)} à l'échelle ${report.valuation.scale}`,
    `Écarts : ${deviations || 'aucun'}`,
    `Propositions : ${proposals}`,
    `Journal : ${report.entries.length} entrée(s), ids ${report.entries.map((e) => e.id).join(', ') || 'aucun'}`,
  ].join('\n')
}

/** Rendu déterministe : JSON canonique, puis résumé texte. Identique octet par octet à chaque exécution. */
export function renderReport(report: Report): string {
  return `${canonicalJson(toPlain(report))}\n${textSummary(report)}`
}

/** Assemble le rapport simulé à partir des résultats calculés du domaine. */
export function buildReport(parts: {
  valuation: {
    total: bigint
    scale: number
    quoteCurrency: AssetCode
    perAsset: ReadonlyMap<AssetCode, bigint>
  }
  deviations: readonly Deviation[]
  proposals: readonly Proposal[]
  entries: readonly JournalEntry[]
}): Report {
  return {
    kind: 'simulated',
    valuation: {
      total: { units: parts.valuation.total, decimals: parts.valuation.scale },
      scale: parts.valuation.scale,
      quoteCurrency: parts.valuation.quoteCurrency,
      perAsset: [...parts.valuation.perAsset].map(([asset, units]) => ({
        asset,
        value: { units, decimals: parts.valuation.scale },
      })),
    },
    deviations: parts.deviations,
    proposals: parts.proposals,
    entries: parts.entries,
  }
}
