import { describe, expect, test } from 'bun:test'
import {
  MissingFieldError,
  QuoteMismatchError,
  ScaleMismatchError,
} from '../../src/domain/errors.ts'
import {
  amount,
  assetCode,
  assetMeta,
  holding,
  price,
  signedDelta,
  snapshot,
} from '../../src/domain/portfolio.ts'

const BTC = assetMeta('BTC', 8, 'USDT')
const ETH = assetMeta('ETH', 18, 'USDT')

function baseSnapshot() {
  return snapshot({
    assets: [BTC, ETH],
    observedAt: '2026-09-11T00:00:00Z',
    holdings: [holding(BTC.code, amount(BTC.code, 125000000n))],
    prices: [price(BTC, 'USDT', 27185000n, 2)],
  })
}

describe('fabriques de portfolio', () => {
  test('valide les codes d’actif', () => {
    expect(String(assetCode('BTC'))).toBe('BTC')
    expect(() => assetCode('btc')).toThrow(MissingFieldError)
    expect(() => assetCode('TROPDECARACTERES')).toThrow(MissingFieldError)
    expect(() => assetCode('')).toThrow(MissingFieldError)
  })

  test('valide les décimales des métadonnées', () => {
    expect(assetMeta('BTC', 8, 'USDT').decimals).toBe(8)
    expect(() => assetMeta('BTC', 19, 'USDT')).toThrow(MissingFieldError)
    expect(() => assetMeta('BTC', -1, 'USDT')).toThrow(MissingFieldError)
    expect(() => assetMeta('BTC', 2.5, 'USDT')).toThrow(MissingFieldError)
  })

  test('refuse un montant à unités négatives', () => {
    expect(() => amount(BTC.code, -1n)).toThrow(ScaleMismatchError)
    expect(amount(BTC.code, 0n).units).toBe(0n)
  })

  test('accepte un delta signé', () => {
    expect(signedDelta(BTC.code, -5n, 8).units).toBe(-5n)
  })

  test('refuse un prix coté hors devise de l’actif', () => {
    expect(() => price(BTC, 'USD', 27185000n, 2)).toThrow(QuoteMismatchError)
  })

  test('refuse un prix nul ou négatif', () => {
    expect(() => price(BTC, 'USDT', 0n, 2)).toThrow(ScaleMismatchError)
    expect(() => price(BTC, 'USDT', -5n, 2)).toThrow(ScaleMismatchError)
  })

  test('valide le horodatage ISO 8601 du snapshot', () => {
    expect(() => snapshot({ assets: [BTC], observedAt: 'hier', holdings: [], prices: [] })).toThrow(
      MissingFieldError,
    )
  })

  test('refuse des métadonnées dupliquées ou conflictuelles', () => {
    expect(() =>
      snapshot({
        assets: [BTC, assetMeta('BTC', 8, 'USDT')],
        observedAt: '2026-09-11T00:00:00Z',
        holdings: [],
        prices: [],
      }),
    ).toThrow(MissingFieldError)
    expect(() =>
      snapshot({
        assets: [BTC, assetMeta('BTC', 8, 'USD')],
        observedAt: '2026-09-11T00:00:00Z',
        holdings: [],
        prices: [],
      }),
    ).toThrow(MissingFieldError)
  })

  test('refuse une position ou un prix hors métadonnées', () => {
    const SOL = assetMeta('SOL', 9, 'USDT')
    expect(() =>
      snapshot({
        assets: [BTC],
        observedAt: '2026-09-11T00:00:00Z',
        holdings: [holding(SOL.code, amount(SOL.code, 1n))],
        prices: [],
      }),
    ).toThrow(MissingFieldError)
    expect(() =>
      snapshot({
        assets: [BTC],
        observedAt: '2026-09-11T00:00:00Z',
        holdings: [],
        prices: [price(SOL, 'USDT', 100n, 2)],
      }),
    ).toThrow(MissingFieldError)
  })

  test('trie les tableaux par code quel que soit l’ordre d’entrée', () => {
    const snap = snapshot({
      assets: [ETH, BTC],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [holding(ETH.code, amount(ETH.code, 1n)), holding(BTC.code, amount(BTC.code, 1n))],
      prices: [],
    })
    expect(snap.assets.map((a) => String(a.code))).toEqual(['BTC', 'ETH'])
    expect(snap.holdings.map((h) => String(h.asset))).toEqual(['BTC', 'ETH'])
  })

  test('accepte un snapshot sans position ni prix', () => {
    const snap = snapshot({
      assets: [BTC],
      observedAt: '2026-09-11T00:00:00Z',
      holdings: [],
      prices: [],
    })
    expect(snap.holdings).toHaveLength(0)
    expect(snap.prices).toHaveLength(0)
  })

  test('produit des objets figés', () => {
    const snap = baseSnapshot()
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.assets)).toBe(true)
    expect(Object.isFrozen(snap.holdings[0])).toBe(true)
  })

  test('n’exige pas la complétude des prix à l’observation', () => {
    // Un snapshot peut observer partiellement les prix ; la valorisation refuse l'incomplétude.
    expect(() => baseSnapshot()).not.toThrow()
  })
})
