import { describe, expect, test } from 'bun:test'
import { MissingPriceError, MixedQuoteCurrencyError } from '../../src/domain/errors.ts'
import { amount, assetMeta, holding, price, snapshot } from '../../src/domain/portfolio.ts'
import { quoteCurrencyOf, valueOfHoldings } from '../../src/domain/valuation.ts'

const BTC = assetMeta('BTC', 8, 'USDT')
const ETH = assetMeta('ETH', 18, 'USDT')
const SOL = assetMeta('SOL', 9, 'USDT')

/** Jeu de référence : 1,25 BTC + 8 ETH + 100 SOL cotés USDT → 395187,5 USDT à l'échelle 20. */
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

describe('valorisation', () => {
  test('valorise exactement à l’échelle commune, sans division', () => {
    const valuation = valueOfHoldings(referenceSnapshot())
    expect(valuation.scale).toBe(20)
    expect(valuation.total).toBe(39518750000000000000000000n) // 395187,5 USDT
    expect(valuation.perAsset.get(BTC.code)).toBe(33981250000000000000000000n) // 339812,5
    expect(valuation.perAsset.get(ETH.code)).toBe(3450000000000000000000000n) // 34500
    expect(valuation.perAsset.get(SOL.code)).toBe(2087500000000000000000000n) // 20875
  })

  test('accepte un snapshot vide', () => {
    const empty = snapshot({
      assets: [],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [],
      prices: [],
    })
    const valuation = valueOfHoldings(empty)
    expect(valuation.total).toBe(0n)
    expect(valuation.scale).toBe(0)
    expect(valuation.perAsset.size).toBe(0)
  })

  test('refuse un actif détenu sans prix', () => {
    const sansPrixSol = snapshot({
      assets: [BTC, SOL],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [holding(SOL.code, amount(SOL.code, 1n))],
      prices: [price(BTC, 'USDT', 27185000n, 2)],
    })
    expect(() => valueOfHoldings(sansPrixSol)).toThrow(MissingPriceError)
  })

  test('refuse des devises de cote mêlées', () => {
    const USD = assetMeta('USD', 2, 'USD')
    const mêlés = snapshot({
      assets: [BTC, USD],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [
        holding(BTC.code, amount(BTC.code, 1n)),
        holding(USD.code, amount(USD.code, 100n)),
      ],
      prices: [price(BTC, 'USDT', 27185000n, 2), price(USD, 'USD', 100n, 0)],
    })
    expect(() => valueOfHoldings(mêlés)).toThrow(MixedQuoteCurrencyError)
    expect(String(quoteCurrencyOf(referenceSnapshot()))).toBe('USDT')
  })
})
