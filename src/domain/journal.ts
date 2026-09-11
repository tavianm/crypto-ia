import type { FeePolicy, TargetAllocation } from './allocation.ts'
import { MissingFieldError } from './errors.ts'
import { canonicalAmount, type Snapshot } from './portfolio.ts'

const FNV_OFFSET_BASIS = 14695981039346656037n
const FNV_PRIME = 1099511628211n
const FNV_MASK = (1n << 64n) - 1n

/** Empreinte FNV-1a 64 bits, pure et déterministe (identité de rejeu, pas de garantie anti-collision). */
export function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_PRIME) & FNV_MASK
  }
  return hash
}

export function toHex64(value: bigint): string {
  return value.toString(16).padStart(16, '0')
}

/** Forme canonique : JSON à clés triées récursivement, sans blanc, UTF-8. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export interface JournalEntry {
  readonly schemaVersion: '1'
  readonly id: string
  readonly kind: 'simulation' | 'rejection'
  readonly allocationPolicyVersion: string
  readonly feePolicyVersion: string
  readonly source: 's1-fixture'
  readonly inputFingerprint: string
  readonly observedAt: string
  readonly data: Record<string, unknown>
}

export interface SimulationInput {
  readonly snapshot: Snapshot
  readonly targetAllocation: TargetAllocation
  readonly feePolicy: FeePolicy
}

/** Empreinte des entrées brutes (snapshot + politiques) sur leur forme canonique. */
export function fingerprintInput(input: SimulationInput): string {
  const metas = new Map(input.snapshot.assets.map((a) => [a.code, a]))
  const payload = {
    snapshot: {
      observedAt: input.snapshot.observedAt,
      assets: input.snapshot.assets.map((a) => ({
        code: a.code,
        decimals: a.decimals,
        quoteCurrency: a.quoteCurrency,
      })),
      holdings: input.snapshot.holdings.map((h) => ({
        asset: h.asset,
        units: canonicalAmount({
          units: h.amount.units,
          decimals: metas.get(h.asset)?.decimals ?? 0,
        }),
      })),
      prices: input.snapshot.prices.map((p) => ({
        asset: p.asset,
        quote: p.quote,
        units: canonicalAmount({ units: p.units, decimals: p.decimals }),
      })),
    },
    targetAllocation: {
      policyVersion: input.targetAllocation.policyVersion,
      weights: input.targetAllocation.weights.map((w) => ({
        asset: w.asset,
        weightBps: w.weightBps,
      })),
    },
    feePolicy: {
      policyVersion: input.feePolicy.policyVersion,
      bpsPerTrade: input.feePolicy.bpsPerTrade,
    },
  }
  return toHex64(fnv1a64(canonicalJson(payload)))
}

function requireText(value: string | undefined, field: string): string {
  if (!value) throw new MissingFieldError(field, 'chaîne non vide')
  return value
}

function entryId(entry: Omit<JournalEntry, 'id'>): string {
  return toHex64(fnv1a64(canonicalJson(entry)))
}

function baseEntry(
  input: {
    allocationPolicyVersion?: string
    feePolicyVersion?: string
    observedAt?: string
    inputFingerprint?: string
  },
  kind: 'simulation' | 'rejection',
): Omit<JournalEntry, 'id'> {
  return {
    schemaVersion: '1',
    kind,
    allocationPolicyVersion: requireText(input.allocationPolicyVersion, 'allocationPolicyVersion'),
    feePolicyVersion: requireText(input.feePolicyVersion, 'feePolicyVersion'),
    source: 's1-fixture',
    inputFingerprint: requireText(input.inputFingerprint, 'inputFingerprint'),
    observedAt: requireText(input.observedAt, 'observedAt'),
    data: {},
  }
}

/** Entrée de résultat simulé ; l'id est calculé hors champ id (pas d'auto-référence). */
export function createSimulationEntry(
  header: {
    allocationPolicyVersion: string
    feePolicyVersion: string
    observedAt: string
    inputFingerprint: string
  },
  data: Record<string, unknown>,
): JournalEntry {
  const withoutId = { ...baseEntry(header, 'simulation'), data }
  return Object.freeze({ ...withoutId, id: entryId(withoutId) })
}

/** Entrée de refus : cite le champ fautif et le motif, jamais la valeur soumise. */
export function createRejectionEntry(
  header: {
    allocationPolicyVersion: string
    feePolicyVersion: string
    observedAt: string
    inputFingerprint: string
  },
  rejection: { field: string | null; reason: string },
): JournalEntry {
  const withoutId = {
    ...baseEntry(header, 'rejection'),
    data: { field: rejection.field, reason: rejection.reason },
  }
  return Object.freeze({ ...withoutId, id: entryId(withoutId) })
}

/** Sérialisation canonique complète d'une entrée (id inclus). */
export function serializeEntry(entry: JournalEntry): string {
  return canonicalJson(entry)
}
