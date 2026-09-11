import { describe, expect, test } from 'bun:test'
import { computeDeviations, feePolicy, targetAllocation } from '../../src/domain/allocation.ts'
import { createSimulationEntry } from '../../src/domain/journal.ts'
import {
  amount,
  assetCode,
  assetMeta,
  holding,
  price,
  snapshot,
} from '../../src/domain/portfolio.ts'
import { buildReport, formatDecimal, renderReport } from '../../src/domain/report.ts'
import { simulateDeviations } from '../../src/domain/simulation.ts'
import { valueOfHoldings } from '../../src/domain/valuation.ts'

const BTC = assetMeta('BTC', 8, 'USDT')
const ETH = assetMeta('ETH', 18, 'USDT')

function petitRapport() {
  const snap = snapshot({
    assets: [BTC, ETH],
    observedAt: '2026-09-11T00:00:00Z',
    holdings: [holding(BTC.code, amount(BTC.code, 100n))],
    prices: [price(BTC, 'USDT', 200n, 2), price(ETH, 'USDT', 300n, 2)],
  })
  const cible = targetAllocation('s1-target-1', [
    { asset: 'BTC', weightBps: 10000 },
    { asset: 'ETH', weightBps: 0 },
  ])
  const frais = feePolicy('s1-fees-1', 10)
  const deviations = computeDeviations(snap, cible)
  const valuation = valueOfHoldings(snap)
  const { proposals } = simulateDeviations(deviations, snap, frais)
  const entry = createSimulationEntry(
    {
      allocationPolicyVersion: cible.policyVersion,
      feePolicyVersion: frais.policyVersion,
      observedAt: snap.observedAt,
      inputFingerprint: '0123456789abcdef',
    },
    { proposals: proposals.length },
  )
  return buildReport({
    valuation: {
      total: valuation.total,
      scale: valuation.scale,
      quoteCurrency: assetCode('USDT'),
      perAsset: valuation.perAsset,
    },
    deviations,
    proposals,
    entries: [entry],
  })
}

describe('rendu de rapport', () => {
  test('rend un JSON canonique identique octet par octet', () => {
    const first = renderReport(petitRapport())
    const second = renderReport(petitRapport())
    expect(first).toBe(second)
    const json = first.slice(0, first.indexOf('\n'))
    expect(json.startsWith('{')).toBe(true)
    // Ordre alphabétique strict des clés de premier niveau : …entries, kind, proposals, valuation…
    expect(json).toContain('"kind":"simulated","proposals":')
    expect(json.indexOf('"deviations"')).toBeLessThan(json.indexOf('"entries"'))
    expect(json.indexOf('"entries"')).toBeLessThan(json.indexOf('"kind":"simulated","proposals"'))
  })

  test('sérialise les montants en chaînes e-decimales', () => {
    const rendu = renderReport(petitRapport())
    expect(rendu).toContain('e-20')
  })

  test('complète le JSON par un résumé texte déterministe', () => {
    const rendu = renderReport(petitRapport())
    const lignes = rendu.split('\n')
    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes[1]).toContain('# Rapport simulé (shadow)')
    expect(lignes[1]).toContain('USDT')
  })

  test('formate les décimaux sans Intl', () => {
    expect(formatDecimal(39518750000000000000000000n, 20)).toBe('395187.5')
    expect(formatDecimal(-14221875000000000000000000n, 20)).toBe('-142218.75')
    expect(formatDecimal(5n, 0)).toBe('5')
    expect(formatDecimal(7n, 2)).toBe('0.07')
    expect(formatDecimal(-3n, 20)).toBe('-0.00000000000000000003')
    expect(formatDecimal(0n, 20)).toBe('0')
  })
})
