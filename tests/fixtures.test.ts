import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MissingFieldError } from '../src/domain/errors.ts'
import { loadInput } from '../src/main.ts'

const FIXTURE = join(import.meta.dir, '..', 'fixtures', 's1-synthetic-portfolio.json')

describe('fixture S1', () => {
  test('se charge en entrée valide via les fabriques du domaine', () => {
    const input = loadInput(FIXTURE)
    expect(input.snapshot.observedAt).toBe('2026-09-11T00:00:00Z')
    expect(input.snapshot.holdings.length).toBe(3)
    expect(input.snapshot.prices.length).toBe(3)
    expect(input.targetAllocation.policyVersion).toBe('s1-target-1')
    expect(input.feePolicy.bpsPerTrade).toBe(10)
  })

  test('décrit une allocation sommant exactement 10000 bps', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      targetAllocation: { weights: { weightBps: number }[] }
    }
    const sum = raw.targetAllocation.weights.reduce((sum, w) => sum + w.weightBps, 0)
    expect(sum).toBe(10000)
  })

  test('ne décrit qu’une seule devise de cote', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      assets: { quoteCurrency: string }[]
    }
    expect(new Set(raw.assets.map((a) => a.quoteCurrency)).size).toBe(1)
  })

  test('refuse un champ manquant sans afficher de valeur', () => {
    const invalide = join(import.meta.dir, '..', 'fixtures', '__invalid-missing-field.json')
    expect(() => loadInput(invalide)).toThrow(MissingFieldError)
  })
})
