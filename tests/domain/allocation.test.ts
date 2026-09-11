import { describe, expect, test } from 'bun:test'
import { computeDeviations, targetAllocation } from '../../src/domain/allocation.ts'
import { MissingFieldError } from '../../src/domain/errors.ts'
import { amount, assetMeta, holding, price, snapshot } from '../../src/domain/portfolio.ts'

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

describe('politique de cible', () => {
  test('refuse une somme de poids ≠ 10000 bps', () => {
    expect(() =>
      targetAllocation('s1-x', [
        { asset: 'BTC', weightBps: 5000 },
        { asset: 'ETH', weightBps: 4000 },
      ]),
    ).toThrow(MissingFieldError)
  })

  test('refuse un poids négatif, non entier ou un code invalide', () => {
    expect(() =>
      targetAllocation('s1-x', [
        { asset: 'BTC', weightBps: -1 },
        { asset: 'ETH', weightBps: 10001 },
      ]),
    ).toThrow(MissingFieldError)
    expect(() =>
      targetAllocation('s1-x', [
        { asset: 'BTC', weightBps: 1.5 },
        { asset: 'ETH', weightBps: 9998.5 },
      ]),
    ).toThrow(MissingFieldError)
    expect(() =>
      targetAllocation('s1-x', [
        { asset: 'btc', weightBps: 0 },
        { asset: 'ETH', weightBps: 10000 },
      ]),
    ).toThrow(MissingFieldError)
  })

  test('trie les poids par code et exige une version de politique', () => {
    expect(CIBLE.weights.map((w) => String(w.asset))).toEqual(['BTC', 'ETH', 'SOL'])
    expect(() => targetAllocation('', [{ asset: 'BTC', weightBps: 10000 }])).toThrow(
      MissingFieldError,
    )
  })
})

describe('écarts à la cible', () => {
  test('calcule poids courants et écarts en bps sur le jeu de référence', () => {
    const deviations = computeDeviations(referenceSnapshot(), CIBLE)
    expect(deviations.map((d) => String(d.asset))).toEqual(['BTC', 'ETH', 'SOL'])
    // 339812,5 / 395187,5 × 10000 = 8598,77… → 8598 (troncature vers zéro)
    expect(deviations[0]).toMatchObject({ currentBps: 8598, targetBps: 5000, deviationBps: -3598 })
    expect(deviations[1]).toMatchObject({ currentBps: 873, targetBps: 3500, deviationBps: 2627 })
    expect(deviations[2]).toMatchObject({ currentBps: 528, targetBps: 1500, deviationBps: 972 })
  })

  test('calcule des poids courants nuls sur un portefeuille vide', () => {
    const vide = snapshot({
      assets: [BTC, ETH, SOL],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [],
      prices: [],
    })
    const deviations = computeDeviations(vide, CIBLE)
    for (const d of deviations) {
      expect(d.currentBps).toBe(0)
      expect(d.value.units).toBe(0n)
    }
  })

  test('n’exige pas de prix pour un actif ciblé non détenu quand rien n’est détenu', () => {
    const vide = snapshot({
      assets: [BTC, ETH, SOL],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [],
      prices: [],
    })
    expect(() => computeDeviations(vide, CIBLE)).not.toThrow()
  })
})
