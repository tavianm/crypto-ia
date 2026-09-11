import { canonicalJson } from '../domain/journal.ts'
import { canonicalAmount } from '../domain/portfolio.ts'
import { formatDecimal } from '../domain/report.ts'
import type { ObservationReport } from './observe-portfolio.ts'

/**
 * Rendu du rapport d'observation (R1), conventions S1 (`renderReport`) : JSON canonique stable
 * suivi d'un résumé texte, identique octet par octet à chaque exécution. Fonctions pures :
 * aucune I/O, aucune horloge, aucun recours à Intl ou à une locale. Le rapport ne porte
 * structurellement que des données d'observation — aucun secret ni valeur d'environnement.
 */

/** Sérialisation canonique du rapport : montants et prix en chaînes "<units>e-<decimals>". */
function toPlain(report: ObservationReport): Record<string, unknown> {
  const metas = new Map(report.snapshot.assets.map((a) => [a.code, a]))
  const scale = report.valuation.scale
  return {
    kind: report.kind,
    snapshot: {
      observedAt: report.snapshot.observedAt,
      assets: report.snapshot.assets.map((a) => ({
        code: a.code,
        decimals: a.decimals,
        quoteCurrency: a.quoteCurrency,
      })),
      holdings: report.snapshot.holdings.map((h) => ({
        asset: h.asset,
        units: canonicalAmount({
          units: h.amount.units,
          decimals: metas.get(h.asset)?.decimals ?? 0,
        }),
      })),
      prices: report.snapshot.prices.map((p) => ({
        asset: p.asset,
        quote: p.quote,
        units: canonicalAmount({ units: p.units, decimals: p.decimals }),
      })),
    },
    valuation: {
      total: canonicalAmount({ units: report.valuation.total, decimals: scale }),
      scale,
      perAsset: [...report.valuation.perAsset]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([asset, units]) => ({ asset, value: canonicalAmount({ units, decimals: scale }) })),
    },
    untracked: report.untracked,
    dust: report.dust,
    references: report.references ?? [],
    freshness: report.freshness,
    entries: report.entries,
  }
}

/** Résumé texte : références brutes, unités traduites, prix, valeurs, fraîcheur et journal. */
function textSummary(report: ObservationReport): string {
  const metas = new Map(report.snapshot.assets.map((a) => [a.code, a]))
  const prices = new Map(report.snapshot.prices.map((p) => [p.asset, p]))
  const references = new Map((report.references ?? []).map((r) => [r.asset, r]))
  const scale = report.valuation.scale
  const actifs = [...report.snapshot.holdings]
    .sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0))
    .map((h) => {
      const brut = references.get(h.asset)
      const prix = prices.get(h.asset)
      const valeur = report.valuation.perAsset.get(h.asset)
      const brutTexte = brut ? `${brut.krakenCode} ${brut.rawBalance}` : '—'
      const traduit = canonicalAmount({
        units: h.amount.units,
        decimals: metas.get(h.asset)?.decimals ?? 0,
      })
      const prixTexte = prix
        ? `${canonicalAmount({ units: prix.units, decimals: prix.decimals })} ${prix.quote}`
        : '—'
      const valeurTexte =
        prix !== undefined && valeur !== undefined
          ? `${formatDecimal(valeur, scale)} ${prix.quote}`
          : '—'
      return `  ${h.asset} : brut ${brutTexte} | traduit ${traduit} | prix ${prixTexte} | valeur ${valeurTexte}`
    })
    .join('\n')
  const nonSuivis = report.untracked.map((u) => `${u.krakenCode} ${u.rawBalance}`).join(' | ')
  const poussiere = report.dust.map((d) => `${d.krakenCode} ${d.rawBalance}`).join(' | ')
  return [
    `# Rapport observé (observed, shadow) — total ${formatDecimal(report.valuation.total, scale)} à l'échelle ${scale}`,
    actifs ? `Actifs suivis :\n${actifs}` : 'Actifs suivis : aucune position',
    `Horodatages : soldes ${report.freshness.balancesAt} | prix ${report.freshness.pricesAt} | observedAt ${report.snapshot.observedAt}`,
    `Non suivis : ${nonSuivis || 'aucun'}`,
    `Poussière : ${poussiere || 'aucune'}`,
    `Journal : ${report.entries.length} entrée(s), ids ${report.entries.map((e) => e.id).join(', ') || 'aucun'}`,
  ].join('\n')
}

/** Rendu déterministe du rapport d'observation : JSON canonique, puis résumé texte. */
export function renderObservationReport(report: ObservationReport): string {
  return `${canonicalJson(toPlain(report))}\n${textSummary(report)}`
}
