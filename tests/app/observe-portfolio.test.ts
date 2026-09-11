import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { observePortfolio } from '../../src/app/observe-portfolio.ts'
import { canonicalJson, fnv1a64, toHex64 } from '../../src/domain/journal.ts'
import { amount, assetMeta, holding, price } from '../../src/domain/portfolio.ts'
import { type Valuation, valueOfHoldings } from '../../src/domain/valuation.ts'
import { observedSnapshot } from '../../src/ports/portfolio-source.ts'

const ROOT = join(import.meta.dir, '..', '..')

const BTC = assetMeta('BTC', 8, 'USDT')
const ETH = assetMeta('ETH', 18, 'USDT')
const SOL = assetMeta('SOL', 9, 'USDT')

/**
 * Jeu S1 (montants et prix de fixtures/s1-synthetic-portfolio.json) avec horodatages gelés
 * distincts : soldes à 00:00:00.000Z, prix à 00:00:01.000Z. La poussière et les actifs non
 * suivis issus de la traduction transitent par le port `ObservedSnapshot` (champs optionnels),
 * seul argument du cas d'usage pur.
 */
function entreeJeuS1() {
  return {
    assets: [BTC, ETH, SOL],
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
    balancesObservedAt: '2026-09-11T00:00:00.000Z',
    pricesObservedAt: '2026-09-11T00:00:01.000Z',
  }
}

type BalanceBrute = { krakenCode: string; rawBalance: string }

/** Liste { krakenCode, rawBalance } portée par les données d'une entrée de journal sous la clé donnée. */
function balancesBrutes(data: Record<string, unknown>, cle: string): BalanceBrute[] {
  const valeur = data[cle]
  return Array.isArray(valeur) ? (valeur as BalanceBrute[]) : []
}

/** Valeurs perAsset indexées par code simple (les clés du domaine sont des AssetCode typés). */
function parActif(valuation: Valuation): Map<string, bigint> {
  return new Map([...valuation.perAsset].map(([code, units]) => [String(code), units]))
}

describe('cas d’usage d’observation', () => {
  test('produit un rapport observé avec la valorisation exacte du jeu S1', () => {
    const observed = observedSnapshot(entreeJeuS1())
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observed')
    if (outcome.kind !== 'observed') return
    expect(outcome.report.kind).toBe('observed')
    const attendu = valueOfHoldings(observed.snapshot)
    expect(outcome.report.valuation.total).toBe(attendu.total)
    expect(outcome.report.valuation.scale).toBe(attendu.scale)
    // 1.25 BTC × 271850.00 + 8 ETH × 4312.50 + 100 SOL × 208.75 = 395187.50 USDT (échelle 20).
    expect(outcome.report.valuation.total).toBe(39518750000000000000000000n)
    expect(outcome.report.valuation.scale).toBe(20)
    const valeurs = parActif(outcome.report.valuation)
    expect(valeurs.get('BTC')).toBe(33981250000000000000000000n)
    expect(valeurs.get('ETH')).toBe(3450000000000000000000000n)
    expect(valeurs.get('SOL')).toBe(2087500000000000000000000n)
  })

  test('porte la fraîcheur appariée et retient l’horodatage le plus ancien', () => {
    const observed = observedSnapshot(entreeJeuS1())
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observed')
    if (outcome.kind !== 'observed') return
    expect(outcome.report.freshness.balancesAt).toBe('2026-09-11T00:00:00.000Z')
    expect(outcome.report.freshness.pricesAt).toBe('2026-09-11T00:00:01.000Z')
    expect(outcome.report.freshness.balancesAt).not.toBe(outcome.report.freshness.pricesAt)
    expect(outcome.report.snapshot.observedAt).toBe('2026-09-11T00:00:00.000Z')
  })

  test('journalise une entrée d’observation dont l’id est calculé hors champ id', () => {
    const observed = observedSnapshot(entreeJeuS1())
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observed')
    if (outcome.kind !== 'observed') return
    expect(outcome.report.entries).toHaveLength(1)
    const entry = outcome.report.entries.find((e) => e.kind === 'observation')
    expect(entry).toBeDefined()
    if (entry === undefined) return
    expect(entry.source).toBe('s2-kraken-replay')
    expect(entry.schemaVersion).toBeDefined()
    expect(entry.observedAt).toBe('2026-09-11T00:00:00.000Z')
    expect(entry.inputFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(Array.isArray(entry.data.dust)).toBe(true)
    expect(Array.isArray(entry.data.untracked)).toBe(true)
    expect(balancesBrutes(entry.data, 'dust')).toHaveLength(0)
    expect(balancesBrutes(entry.data, 'untracked')).toHaveLength(0)
    const { id, ...sansId } = entry
    expect(id).toBe(toHex64(fnv1a64(canonicalJson(sansId))))
  })

  test('propage la poussière dans le rapport et dans l’entrée de journal, jamais silencieusement', () => {
    const observed = observedSnapshot({
      ...entreeJeuS1(),
      dust: [{ krakenCode: 'XXBT', rawBalance: '0.0012500009' }],
    })
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observed')
    if (outcome.kind !== 'observed') return
    expect(
      outcome.report.dust.some((d) => d.krakenCode === 'XXBT' && d.rawBalance === '0.0012500009'),
    ).toBe(true)
    const entry = outcome.report.entries.find((e) => e.kind === 'observation')
    expect(entry).toBeDefined()
    if (entry === undefined) return
    expect(
      balancesBrutes(entry.data, 'dust').some(
        (d) => d.krakenCode === 'XXBT' && d.rawBalance === '0.0012500009',
      ),
    ).toBe(true)
  })

  test('liste les actifs non suivis sans bloquer l’observation', () => {
    const observed = observedSnapshot({
      ...entreeJeuS1(),
      untracked: [
        { krakenCode: 'ZUSD', rawBalance: '42.13' },
        { krakenCode: 'XLTC', rawBalance: '1.5' },
      ],
    })
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observed')
    if (outcome.kind !== 'observed') return
    const codes = outcome.report.untracked.map((u) => u.krakenCode)
    expect(codes).toContain('ZUSD')
    expect(codes).toContain('XLTC')
  })

  test('refuse un actif détenu sans prix avec une entrée de rejet typée sans valeur exposée', () => {
    const observed = observedSnapshot({
      assets: [BTC, ETH, SOL],
      holdings: [holding(BTC.code, amount(BTC.code, 125000000n))],
      prices: [],
      balancesObservedAt: '2026-09-11T00:00:00.000Z',
      pricesObservedAt: '2026-09-11T00:00:01.000Z',
    })
    const outcome = observePortfolio(observed)
    expect(outcome.kind).toBe('observation-rejection')
    if (outcome.kind !== 'observation-rejection') return
    expect('report' in outcome).toBe(false)
    expect(outcome.error.name).toBe('MissingPriceError')
    expect(outcome.error.field).toBe('price')
    const entry = outcome.entries.find((e) => e.kind === 'observation-rejection')
    expect(entry).toBeDefined()
    if (entry === undefined) return
    expect(entry.data).toMatchObject({ field: 'price', reason: 'MissingPriceError' })
    const canonique = canonicalJson(outcome.entries)
    expect(canonique).not.toContain('"kind":"observed"')
    expect(canonique).not.toContain('125000000')
  })

  test('le cas d’usage ne lit jamais l’environnement', () => {
    const contenu = readFileSync(join(ROOT, 'src', 'app', 'observe-portfolio.ts'), 'utf8')
    expect(contenu.includes('process.env'), 'process.env interdit dans le cas d’usage').toBe(false)
    expect(contenu.includes('Bun.env'), 'Bun.env interdit dans le cas d’usage').toBe(false)
  })
})
