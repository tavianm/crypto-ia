import { describe, expect, test } from 'bun:test'
import { DomainError, MissingFieldError } from '../../../src/domain/errors.ts'
import { amount, assetMeta, holding, price } from '../../../src/domain/portfolio.ts'
import { observedSnapshot } from '../../../src/ports/portfolio-source.ts'

/** Retourne l'erreur levée par l'action, ou échoue si l'action n'en a levé aucune. */
function erreurLeveePar(action: () => void): Error {
  try {
    action()
  } catch (e) {
    return e as Error
  }
  throw new Error('aucun refus typé n’a été levé')
}

const BTC = assetMeta('BTC', 8, 'USDT')
const SOL = assetMeta('SOL', 9, 'USDT')

/** Entrée valide construite avec les fabriques du domaine. */
function entreeValide() {
  return {
    assets: [BTC, SOL],
    holdings: [holding(BTC.code, amount(BTC.code, 125000000n))],
    prices: [price(SOL, 'USDT', 20875n, 2)],
    balancesObservedAt: '2026-09-11T00:00:00Z',
    pricesObservedAt: '2026-09-11T00:00:01Z',
  }
}

describe('port d’observation', () => {
  test('normalise les horodatages vers la forme canonique UTC Z en millisecondes', () => {
    const observed = observedSnapshot({
      ...entreeValide(),
      balancesObservedAt: '2026-09-11T02:00:00+02:00',
      pricesObservedAt: '2026-09-11T00:00:00Z',
    })
    expect(observed.balancesObservedAt).toBe('2026-09-11T00:00:00.000Z')
    expect(observed.pricesObservedAt).toBe('2026-09-11T00:00:00.000Z')
    expect(observed.snapshot.observedAt).toBe('2026-09-11T00:00:00.000Z')
  })

  test('conserve la forme millisecondes pour un horodatage déjà canonique', () => {
    const observed = observedSnapshot({
      ...entreeValide(),
      balancesObservedAt: '2026-09-11T00:00:00.000Z',
      pricesObservedAt: '2026-09-11T00:00:00.500Z',
    })
    expect(observed.balancesObservedAt).toBe('2026-09-11T00:00:00.000Z')
    expect(observed.pricesObservedAt).toBe('2026-09-11T00:00:00.500Z')
  })

  test.each([
    { balances: '2026-09-11T00:00:00Z', prices: '2026-09-11T00:00:01Z' },
    { balances: '2026-09-11T00:00:01Z', prices: '2026-09-11T00:00:00Z' },
  ])(
    'retient le plus ancien des deux horodatages ($balances / $prices)',
    ({ balances, prices }) => {
      const observed = observedSnapshot({
        ...entreeValide(),
        balancesObservedAt: balances,
        pricesObservedAt: prices,
      })
      expect(observed.snapshot.observedAt).toBe('2026-09-11T00:00:00.000Z')
    },
  )

  test('calcule le minimum sur les formes normalisées, pas sur les chaînes brutes', () => {
    const observed = observedSnapshot({
      ...entreeValide(),
      balancesObservedAt: '2026-09-11T02:00:00+02:00', // = 00:00:00Z après normalisation
      pricesObservedAt: '2026-09-11T00:30:00Z',
    })
    expect(observed.snapshot.observedAt).toBe('2026-09-11T00:00:00.000Z')
  })

  test('construit le snapshot embarqué avec les fabriques du domaine', () => {
    const observed = observedSnapshot(entreeValide())
    expect(observed.snapshot.assets.map((a) => String(a.code))).toEqual(['BTC', 'SOL'])
    expect(observed.snapshot.holdings.map((h) => String(h.asset))).toEqual(['BTC'])
    expect(observed.snapshot.holdings.map((h) => h.amount.units)).toEqual([125000000n])
    expect(observed.snapshot.prices.map((p) => String(p.asset))).toEqual(['SOL'])
    expect(observed.snapshot.prices.map((p) => p.units)).toEqual([20875n])
  })

  test('délègue la validation du snapshot embarqué à la fabrique du domaine', () => {
    expect(() =>
      observedSnapshot({
        assets: [BTC],
        holdings: [holding(SOL.code, amount(SOL.code, 1n))],
        prices: [],
        balancesObservedAt: '2026-09-11T00:00:00Z',
        pricesObservedAt: '2026-09-11T00:00:00Z',
      }),
    ).toThrow(MissingFieldError)
  })

  test('refuse un horodatage non ISO sans afficher la valeur', () => {
    const erreur = erreurLeveePar(() =>
      observedSnapshot({ ...entreeValide(), balancesObservedAt: '11/09/2026' }),
    )
    expect(erreur).toBeInstanceOf(DomainError)
    expect(erreur.message).not.toContain('11/09/2026')
  })

  test('fige le résultat et le snapshot embarqué', () => {
    const observed = observedSnapshot(entreeValide())
    expect(Object.isFrozen(observed)).toBe(true)
    expect(Object.isFrozen(observed.snapshot)).toBe(true)
  })
})
