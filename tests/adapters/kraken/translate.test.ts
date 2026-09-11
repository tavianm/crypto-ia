import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { translateBalance, translateTicker } from '../../../src/adapters/kraken/translate.ts'
import { DomainError, ScaleMismatchError } from '../../../src/domain/errors.ts'
import { canonicalAmount } from '../../../src/domain/portfolio.ts'

/** Retourne le premier élément d'une collection, ou échoue si elle est vide. */
function premier<T>(items: readonly T[]): T {
  const [premierElement] = items
  if (premierElement === undefined) {
    throw new Error('la collection devait contenir au moins un élément')
  }
  return premierElement
}

/** Retourne l'erreur levée par l'action, ou échoue si l'action n'en a levé aucune. */
function erreurLeveePar(action: () => void): Error {
  try {
    action()
  } catch (e) {
    return e as Error
  }
  throw new Error('aucun refus typé n’a été levé')
}

/**
 * Comparaison exacte sans flottant : valeur(source) == units × 10^-decimals.
 * Vérifie la perte zéro entre la chaîne source et la forme (units, decimals).
 */
function valeurExacte(source: string, units: bigint, decimals: number): boolean {
  const [entiere, fraction = ''] = source.split('.')
  const chiffres = `${entiere}${fraction}`
  return BigInt(chiffres) * 10n ** BigInt(decimals) === units * 10n ** BigInt(fraction.length)
}

describe('traduction des codes', () => {
  test.each([
    { kraken: 'XXBT', code: 'BTC', brut: '0.00125000', unites: 125000n, decimals: 8 },
    { kraken: 'XBT', code: 'BTC', brut: '1.00000000', unites: 100000000n, decimals: 8 },
    {
      kraken: 'XETH',
      code: 'ETH',
      brut: '8.000000000000000000',
      unites: 8000000000000000000n,
      decimals: 18,
    },
    { kraken: 'ETH', code: 'ETH', brut: '1.5', unites: 1500000000000000000n, decimals: 18 },
    { kraken: 'SOL', code: 'SOL', brut: '100.000000000', unites: 100000000000n, decimals: 9 },
  ])(
    'traduit $kraken en $code à l’échelle du catalogue',
    ({ kraken, code, brut, unites, decimals }) => {
      const resultat = translateBalance({ [kraken]: brut })
      expect(resultat.holdings).toHaveLength(1)
      expect(resultat.holdings.map((h) => String(h.asset))).toEqual([code])
      expect(resultat.holdings.map((h) => h.amount.units)).toEqual([unites])
      const meta = resultat.metas.find((m) => String(m.code) === code)
      expect(meta?.decimals).toBe(decimals)
      expect(String(meta?.quoteCurrency)).toBe('USDT')
      expect(resultat.untracked).toHaveLength(0)
      expect(resultat.dust).toHaveLength(0)
    },
  )

  test('place un solde USDT cash non nul dans untracked, jamais dans les holdings', () => {
    const resultat = translateBalance({ USDT: '42.13' })
    expect(resultat.holdings).toHaveLength(0)
    expect(resultat.dust).toHaveLength(0)
    expect(resultat.untracked).toEqual([{ krakenCode: 'USDT', rawBalance: '42.13' }])
  })

  test.each([
    ['XLTC', '12.5'],
    ['ZUSD', '42.13'],
    ['XXBT.B', '0.5'],
    ['XXBT.F', '0.5'],
    ['XXBT.T', '0.5'],
    ['XXBT.S', '0.5'],
    ['XXBT.M', '0.5'],
    ['SOL.F', '10'],
  ])('%s est hors positions suivies et va dans untracked', (krakenCode, brut) => {
    const resultat = translateBalance({ [krakenCode]: brut })
    expect(resultat.holdings).toHaveLength(0)
    expect(resultat.dust).toHaveLength(0)
    expect(resultat.untracked).toEqual([{ krakenCode, rawBalance: brut }])
  })

  test('liste les actifs non suivis sans bloquer les positions suivies', () => {
    const resultat = translateBalance({ XXBT: '0.00125000', ZUSD: '42.13', USDT: '10.00' })
    expect(resultat.holdings.map((h) => String(h.asset))).toEqual(['BTC'])
    expect(resultat.holdings.map((h) => h.amount.units)).toEqual([125000n])
    expect(resultat.untracked).toHaveLength(2)
    expect(resultat.untracked).toContainEqual({ krakenCode: 'USDT', rawBalance: '10.00' })
    expect(resultat.untracked).toContainEqual({ krakenCode: 'ZUSD', rawBalance: '42.13' })
  })

  test.each([
    ['XXBT', '0'],
    ['XXBT', '0.00000000'],
    ['XXBT', '0.0000000000'],
    ['SOL', '0'],
  ])('ignore un solde nul (%s = %s)', (krakenCode, brut) => {
    const resultat = translateBalance({ [krakenCode]: brut })
    expect(resultat.holdings).toHaveLength(0)
    expect(resultat.untracked).toHaveLength(0)
    expect(resultat.dust).toHaveLength(0)
  })

  test.each(['1,25', 'abc', '-1', '1e5'])(
    'refuse la chaîne non décimale "%s" sans afficher sa valeur',
    (brut) => {
      const erreur = erreurLeveePar(() => translateBalance({ XXBT: brut }))
      expect(erreur).toBeInstanceOf(DomainError)
      expect(erreur.message).not.toContain(brut)
    },
  )

  test('refuse une chaîne vide par un refus typé', () => {
    const erreur = erreurLeveePar(() => translateBalance({ XXBT: '' }))
    expect(erreur).toBeInstanceOf(DomainError)
  })
})

describe('échelles et poussière', () => {
  test('traduit exactement un solde BTC rendu à l’échelle 10 avec excédent nul', () => {
    const resultat = translateBalance({ XXBT: '0.0012500000' })
    expect(resultat.holdings.map((h) => String(h.asset))).toEqual(['BTC'])
    expect(resultat.holdings.map((h) => h.amount.units)).toEqual([125000n])
    const meta = resultat.metas.find((m) => String(m.code) === 'BTC')
    expect(meta?.decimals).toBe(8)
    expect(resultat.dust).toHaveLength(0)
  })

  test.each([
    { kraken: 'XXBT', brut: '0.0012500010', unites: 125000n },
    { kraken: 'SOL', brut: '100.00000000123', unites: 100000000001n },
  ])('tronque vers zéro $kraken $brut et journalise la poussière', ({ kraken, brut, unites }) => {
    const resultat = translateBalance({ [kraken]: brut })
    expect(resultat.holdings.map((h) => h.amount.units)).toEqual([unites])
    expect(resultat.dust).toEqual([{ krakenCode: kraken, rawBalance: brut }])
  })

  test('tronque l’excédent vers zéro sans arrondir', () => {
    const resultat = translateBalance({ XXBT: '0.0012500090' })
    expect(resultat.holdings.map((h) => h.amount.units)).toEqual([125000n])
    expect(resultat.dust).toEqual([{ krakenCode: 'XXBT', rawBalance: '0.0012500090' }])
  })

  test.each([
    { source: '54370', unites: 54370n, decimals: 0 },
    { source: '54370.1', unites: 543701n, decimals: 1 },
    { source: '271850.12345678', unites: 27185012345678n, decimals: 8 },
    { source: '20.123456789012345678', unites: 20123456789012345678n, decimals: 18 },
  ])('parse le prix $source exactement à l’échelle $decimals', ({ source, unites, decimals }) => {
    const prix = translateTicker({ XBTUSDT: { c: [source, '1.20'] } })
    expect(prix).toHaveLength(1)
    const prixBtc = premier(prix)
    expect(String(prixBtc.asset)).toBe('BTC')
    expect(String(prixBtc.quote)).toBe('USDT')
    expect(prixBtc.units).toBe(unites)
    expect(prixBtc.decimals).toBe(decimals)
    expect(canonicalAmount(prixBtc)).toBe(`${unites}e-${decimals}`)
    expect(valeurExacte(source, prixBtc.units, prixBtc.decimals)).toBe(true)
  })

  test('refuse une échelle de prix supérieure à 18 par ScaleMismatchError', () => {
    expect(() => translateTicker({ XBTUSDT: { c: ['1.1234567890123456789', '1.00'] } })).toThrow(
      ScaleMismatchError,
    )
  })

  test('n’applique aucune troncature sur les prix', () => {
    const source = '0.000000012345678901'
    const prix = translateTicker({ SOLUSDT: { c: [source, '1.00'] } })
    expect(prix).toHaveLength(1)
    const prixSol = premier(prix)
    expect(String(prixSol.asset)).toBe('SOL')
    expect(String(prixSol.quote)).toBe('USDT')
    expect(prixSol.units).toBe(12345678901n)
    expect(prixSol.decimals).toBe(18)
    expect(valeurExacte(source, prixSol.units, prixSol.decimals)).toBe(true)
  })
})

describe('statique', () => {
  test('la chaîne de traduction ne contient aucun flottant', () => {
    const source = readFileSync(
      join(import.meta.dir, '..', '..', '..', 'src', 'adapters', 'kraken', 'translate.ts'),
      'utf8',
    )
    expect(source).not.toContain('parseFloat')
    expect(source).not.toContain('Number(')
    expect(source).not.toContain('toFixed')
    expect(source).not.toContain('Math.')
  })
})
