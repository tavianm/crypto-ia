import { describe, expect, test } from 'bun:test'
import { MissingFieldError } from '../../src/domain/errors.ts'
import {
  canonicalJson,
  createRejectionEntry,
  createSimulationEntry,
  fnv1a64,
  serializeEntry,
  toHex64,
} from '../../src/domain/journal.ts'

const EN_TETE = {
  allocationPolicyVersion: 's1-target-1',
  feePolicyVersion: 's1-fees-1',
  observedAt: '2026-09-11T00:00:00Z',
  inputFingerprint: '0123456789abcdef',
}

describe('empreinte FNV-1a', () => {
  test('reproduit les vecteurs de référence', () => {
    expect(fnv1a64('')).toBe(0xcbf29ce484222325n)
    expect(fnv1a64('a')).toBe(0xaf63dc4c8601ec8cn)
  })

  test('est déterministe et s’encode en hexadécimal de 16 caractères', () => {
    expect(fnv1a64('crypto-ia')).toBe(fnv1a64('crypto-ia'))
    expect(toHex64(fnv1a64(''))).toBe('cbf29ce484222325')
    expect(toHex64(1n)).toBe('0000000000000001')
  })
})

describe('entrées de journal', () => {
  test('crée une entrée de simulation complète et déterministe', () => {
    const data = { proposals: 3, valuationTotal: '39518750000000000000000000e-20' }
    const entry = createSimulationEntry(EN_TETE, data)
    expect(entry.kind).toBe('simulation')
    expect(entry.schemaVersion).toBe('1')
    expect(entry.source).toBe('s1-fixture')
    expect(entry.data).toEqual(data)
    const again = createSimulationEntry(EN_TETE, data)
    expect(entry.id).toBe(again.id)
    expect(entry.id).not.toBe(entry.inputFingerprint)
    expect(entry.id).toMatch(/^[0-9a-f]{16}$/)
  })

  test('calcule l’id sur l’entrée hors champ id', () => {
    const entry = createSimulationEntry(EN_TETE, { proposals: 1 })
    const { id: _exclu, ...sansId } = entry
    expect(toHex64(fnv1a64(canonicalJson(sansId)))).toBe(entry.id)
  })

  test('crée une entrée de rejet citant le champ sans la valeur', () => {
    const entry = createRejectionEntry(EN_TETE, { field: 'price', reason: 'MissingPriceError' })
    expect(entry.kind).toBe('rejection')
    expect(entry.data).toEqual({ field: 'price', reason: 'MissingPriceError' })
    const canonique = serializeEntry(entry)
    expect(canonique).not.toContain('125000000')
    expect(entry.id).toMatch(/^[0-9a-f]{16}$/)
  })

  test('sérialise en forme canonique (clés triées, sans blanc)', () => {
    const entry = createSimulationEntry(EN_TETE, { b: 1, a: 2 })
    const canonique = serializeEntry(entry)
    expect(canonique.startsWith('{')).toBe(true)
    expect(canonique).not.toContain(' ')
    const cleId = canonique.indexOf('"id"')
    const cleKind = canonique.indexOf('"kind"')
    expect(cleId).toBeGreaterThan(-1)
    expect(cleKind).toBeGreaterThan(cleId)
  })

  test('exige les champs d’en-tête', () => {
    expect(() => createSimulationEntry({ ...EN_TETE, inputFingerprint: '' }, {})).toThrow(
      MissingFieldError,
    )
    expect(() => createSimulationEntry({ ...EN_TETE, observedAt: '' }, {})).toThrow(
      MissingFieldError,
    )
  })
})
