import { describe, expect, test } from 'bun:test'
import { computeDeviations, feePolicy, targetAllocation } from '../../src/domain/allocation.ts'
import { MissingFieldError, MissingPriceError } from '../../src/domain/errors.ts'
import { amount, assetMeta, holding, price, snapshot } from '../../src/domain/portfolio.ts'
import { simulateDeviations } from '../../src/domain/simulation.ts'

const BTC = assetMeta('BTC', 8, 'USDT')
const ETH = assetMeta('ETH', 18, 'USDT')
const SOL = assetMeta('SOL', 9, 'USDT')

function referenceSnapshot() {
  return snapshot({
    assets: [BTC, ETH, SOL],
    observedAt: '2026-09-11T00:00:00Z',
    holdings: [
      holding(BTC.code, amount(BTC.code, 125000000n)),
      holding(ETH.code, amount(ETH.code, 8000000000000000000n)),
      holding(SOL.code, amount(SOL.code, 100000000000n)),
    ],
    prices: [
      price(BTC, 'USDT', 27185000n, 2),
      price(ETH, 'USDT', 431250n, 2),
      price(SOL, 'USDT', 20875n, 2),
    ],
  })
}

const CIBLE = targetAllocation('s1-target-1', [
  { asset: 'BTC', weightBps: 5000 },
  { asset: 'ETH', weightBps: 3500 },
  { asset: 'SOL', weightBps: 1500 },
])
const FRAIS = feePolicy('s1-fees-1', 10)

describe('politique de frais', () => {
  test('refuse un taux négatif ou non entier', () => {
    expect(() => feePolicy('s1-x', -1)).toThrow(MissingFieldError)
    expect(() => feePolicy('s1-x', 1.5)).toThrow(MissingFieldError)
    expect(feePolicy('s1-x', 0).bpsPerTrade).toBe(0)
  })
})

describe('propositions simulées', () => {
  test('propose une vente BTC avec frais tronqués vers zéro', () => {
    const { proposals } = simulateDeviations(
      computeDeviations(referenceSnapshot(), CIBLE),
      referenceSnapshot(),
      FRAIS,
    )
    const btc = proposals.find((p) => p.asset === 'BTC')
    expect(btc?.kind).toBe('simulated')
    // deltaValue = −142218,75 USDT à l'échelle 20 ; / prix à l'échelle 20 (27185000 × 10^10) → −0,52315155 BTC
    expect(btc?.signedDelta.units).toBe(-52315155n)
    expect(btc?.deltaValue.units).toBe(-14221875000000000000000000n)
    // frais = |deltaValue| × 10 / 10000 = 142,21875 USDT (exact, à l'échelle 20)
    expect(btc?.estimatedFee.units).toBe(14221875000000000000000n)
    expect(btc?.reason).toContain('bps')
  })

  test('propose des achats non nuls pour les actifs sous-pondérés', () => {
    const { proposals } = simulateDeviations(
      computeDeviations(referenceSnapshot(), CIBLE),
      referenceSnapshot(),
      FRAIS,
    )
    const eth = proposals.find((p) => p.asset === 'ETH')
    const sol = proposals.find((p) => p.asset === 'SOL')
    expect(eth?.signedDelta.units).toBeGreaterThan(0n)
    expect(sol?.signedDelta.units).toBeGreaterThan(0n)
    expect(proposals).toHaveLength(3)
  })

  test('journalise la poussière d’arrondi des bps courants', () => {
    // Σ currentBps = 8598 + 873 + 528 = 9999 → poussière de 1 bps
    const { dust } = simulateDeviations(
      computeDeviations(referenceSnapshot(), CIBLE),
      referenceSnapshot(),
      FRAIS,
    )
    const bps = dust.find((d) => d.field === 'currentBps')
    expect(bps?.remainder).toBe(1)
  })

  test('journalise la poussière d’unités quand le delta vaut moins d’une unité', () => {
    // total = 1 SOL = 20875 (échelle 20) ; cible SOL 9999 bps → delta −3 (échelle 20),
    // inférieur au prix d'une unité de SOL (20875 × 10^9) ; ETH ciblé à 1 bps → achat de 4840 unités.
    const presque = targetAllocation('s1-target-2', [
      { asset: 'ETH', weightBps: 1 },
      { asset: 'SOL', weightBps: 9999 },
    ])
    const snap = snapshot({
      assets: [SOL, ETH],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [holding(SOL.code, amount(SOL.code, 1n))],
      prices: [price(SOL, 'USDT', 20875n, 2), price(ETH, 'USDT', 431250n, 2)],
    })
    const { proposals, dust } = simulateDeviations(computeDeviations(snap, presque), snap, FRAIS)
    expect(proposals.map((p) => String(p.asset))).toEqual(['ETH'])
    expect(proposals[0]?.signedDelta.units).toBe(4840n)
    expect(dust).toHaveLength(1)
    expect(dust[0]?.asset).toBe(SOL.code)
    expect(dust[0]?.field).toBe('deltaUnits')
    expect(dust[0]?.remainder).toBe('-2087500000e-20')
  })

  test('ne propose rien pour un actif déjà à la cible exacte', () => {
    const exacte = targetAllocation('s1-target-3', [
      { asset: 'BTC', weightBps: 10000 },
      { asset: 'ETH', weightBps: 0 },
      { asset: 'SOL', weightBps: 0 },
    ])
    const snap = snapshot({
      assets: [BTC, ETH, SOL],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [holding(BTC.code, amount(BTC.code, 100n))],
      prices: [price(BTC, 'USDT', 100n, 0)],
    })
    const { proposals } = simulateDeviations(computeDeviations(snap, exacte), snap, FRAIS)
    expect(proposals).toHaveLength(0)
  })

  test('refuse un actif ciblé non détenu sans prix quand une proposition serait nécessaire', () => {
    const avecDetenu = snapshot({
      assets: [BTC, ETH, SOL],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [holding(BTC.code, amount(BTC.code, 100n))],
      prices: [price(BTC, 'USDT', 100n, 0)],
    })
    expect(() =>
      simulateDeviations(computeDeviations(avecDetenu, CIBLE), avecDetenu, FRAIS),
    ).toThrow(MissingPriceError)
  })
})
