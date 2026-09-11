import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/** Environnement du sous-processus purgé de toute variable Kraken : le rejeu n'exige aucune clé. */
function envSansClesKraken(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(process.env)) {
    if (valeur !== undefined && !cle.startsWith('KRAKEN_')) {
      env[cle] = valeur
    }
  }
  return env
}

function runObserve(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const proc = Bun.spawnSync(['bun', 'src/main.ts', ...args], {
    cwd: ROOT,
    env: envSansClesKraken(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  }
}

describe('CLI observe (e2e replay)', () => {
  // e2e — exempté du portail de falsification (dépend du processus CLI complet).
  test('deux exécutions CLI en replay produisent un stdout identique octet par octet', () => {
    const premiere = runObserve(['observe', '--replay', 'fixtures/kraken/'])
    const seconde = runObserve(['observe', '--replay', 'fixtures/kraken/'])
    expect(premiere.exitCode).toBe(0)
    expect(seconde.exitCode).toBe(0)
    expect(premiere.stdout).toBe(seconde.stdout)
    expect(premiere.stdout.startsWith('{')).toBe(true)
    expect(premiere.stdout).toContain('"kind":"observed"')
    expect(premiere.stdout).not.toContain('"kind":"simulated"')
  })

  test('l’adaptateur de replay ne contient aucun accès réseau', () => {
    const contenu = readFileSync(join(ROOT, 'src', 'adapters', 'kraken', 'replay.ts'), 'utf8')
    expect(contenu.includes('fetch('), 'replay.ts ne doit contenir aucun appel fetch(').toBe(false)
  })
})

describe('CLI observe (échecs propres)', () => {
  test('sans --replay et sans clés, la CLI échoue proprement sans produire de rapport', () => {
    const resultat = runObserve(['observe'])
    expect(resultat.exitCode).not.toBe(0)
    expect(resultat.stderr.length).toBeGreaterThan(0)
    expect(resultat.stdout).not.toContain('"kind":"observed"')
    // Aucune valeur d'environnement ne doit fuir dans le message d'échec.
    for (const valeur of Object.values(envSansClesKraken())) {
      if (valeur.length >= 8 && !valeur.includes('/') && !valeur.includes('\\')) {
        expect(resultat.stderr).not.toContain(valeur)
      }
    }
  })
})

/** Fichiers .ts d'un arbre, parcours récursif : le contrôle statique porte sur tout src/. */
function listerFichiersTs(dir: string): string[] {
  const fichiers: string[] = []
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name)
    if (entree.isDirectory()) fichiers.push(...listerFichiersTs(chemin))
    else if (entree.isFile() && entree.name.endsWith('.ts')) fichiers.push(chemin)
  }
  return fichiers
}

describe('CLI observe (statique SC12)', () => {
  // SC12 — statique : aucun chemin privé Kraken hors le littéral Balance, zéro dépendance runtime.
  test('toute occurrence de /0/private/ dans src/ est exactement le littéral /0/private/Balance', () => {
    const occurrences: { fichier: string; chemin: string }[] = []
    for (const fichier of listerFichiersTs(join(ROOT, 'src'))) {
      const contenu = readFileSync(fichier, 'utf8')
      for (const chemin of contenu.match(/\/0\/private\/[\w${}\/]*/g) ?? []) {
        occurrences.push({ fichier, chemin })
      }
    }
    expect(occurrences.length).toBeGreaterThan(0)
    for (const occurrence of occurrences) {
      expect(
        occurrence.chemin,
        `${occurrence.fichier} contient le chemin privé ${occurrence.chemin}`,
      ).toBe('/0/private/Balance')
    }
  })

  test('package.json ne déclare aucune dépendance runtime', () => {
    const manifeste = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(
      manifeste.dependencies === undefined || Object.keys(manifeste.dependencies).length === 0,
      'aucune dépendance runtime n’est autorisée (le script observe ajouté excepté)',
    ).toBe(true)
  })
})
