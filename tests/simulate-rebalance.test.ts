import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { simulateRebalance } from '../src/app/simulate-rebalance.ts'
import { renderReport } from '../src/domain/report.ts'
import { loadInput } from '../src/main.ts'

const ROOT = join(import.meta.dir, '..')
const FIXTURE = join(ROOT, 'fixtures', 's1-synthetic-portfolio.json')

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const proc = Bun.spawnSync(['bun', 'src/main.ts', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  }
}

// e2e — exempté du portail de falsification (dépend du processus CLI complet).
test('e2e : deux exécutions CLI produisent un stdout identique octet par octet', () => {
  const first = runCli([])
  const second = runCli([])
  expect(first.exitCode).toBe(0)
  expect(first.stdout).toBe(second.stdout)
  expect(first.stdout.startsWith('{')).toBe(true)
  expect(first.stdout).toContain('"kind":"simulated"')
})

// e2e — exempté du portail de falsification.
test('e2e : un actif ciblé sans prix produit un rejet CLI explicite', () => {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    snapshot: { prices: { asset: string }[] }
  }
  raw.snapshot.prices = raw.snapshot.prices.filter((p) => p.asset !== 'SOL')
  writeFileSync(
    join(ROOT, 'fixtures', '__e2e-missing-price.json'),
    `${JSON.stringify(raw, null, 2)}\n`,
  )
  const result = runCli(['--input', 'fixtures/__e2e-missing-price.json'])
  expect(result.exitCode).toBe(1)
  expect(result.stdout).not.toContain('"kind":"simulated"')
  expect(result.stdout).toContain('"kind":"rejection"')
  expect(result.stdout).toContain('MissingPriceError')
  expect(result.stderr).toContain('SOL')
})

test('le rejeu intra-processus est identique octet par octet', () => {
  const input = loadInput(FIXTURE)
  const first = simulateRebalance(input)
  const second = simulateRebalance(input)
  expect(first.kind).toBe('simulated')
  expect(second.kind).toBe('simulated')
  if (first.kind !== 'simulated' || second.kind !== 'simulated') return
  expect(renderReport(first.report)).toBe(renderReport(second.report))
})

test('aucun import réseau, disque, sous-processus, env, horloge ou aléatoire dans le cœur', () => {
  const interdits = [
    'node:http',
    'node:https',
    'node:net',
    'node:fs',
    'node:child_process',
    'fetch(',
    'XMLHttpRequest',
    'spawn(',
    'process.env',
    'Bun.env',
    'Intl.',
    'toLocaleString',
    'Date.now',
    'Math.random',
  ]
  for (const dir of ['src/domain', 'src/app']) {
    const files = readdirSync(join(ROOT, dir)).map((f) => join(ROOT, dir, f))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const motif of interdits) {
        expect(content.includes(motif), `${file} contient ${motif}`).toBe(false)
      }
    }
  }
})
