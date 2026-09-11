import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const projectRoot = resolve(import.meta.dir, '..')
const tempPrefix = 'crypto-ia-secrets-'

function git(root: string, args: string[], optional = false): Buffer {
  const result = Bun.spawnSync(['git', '-C', root, ...args], { stderr: 'pipe' })
  if (result.exitCode !== 0 && !optional) {
    throw new Error(`Échec de la commande Git ${args[0]} ; scan interrompu.`)
  }
  return result.exitCode === 0 ? Buffer.from(result.stdout) : Buffer.alloc(0)
}

/** Copy staged blobs, never the potentially different working-tree content. */
export function snapshotIndex(root: string, destination: string): number {
  const changed = new Set(
    git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
      .toString()
      .split('\0')
      .filter(Boolean),
  )
  let count = 0
  for (const entry of git(root, ['ls-files', '--stage', '-z']).toString().split('\0')) {
    if (!entry) continue
    const tab = entry.indexOf('\t')
    const [mode, object, stage] = entry.slice(0, tab).split(' ')
    const file = entry.slice(tab + 1)
    if (!changed.has(file)) continue
    if (stage !== '0' || !object) throw new Error('Index non résolu ; scan interrompu.')
    if (mode === '160000') throw new Error('Sous-module ajouté ou modifié : scan dédié requis.')
    const target = resolve(destination, file)
    const child = relative(destination, target)
    if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
      throw new Error('Chemin Git hors du snapshot ; scan interrompu.')
    }
    mkdirSync(dirname(target), { recursive: true })
    // Symlink blobs are materialized as regular text, so no external target is followed.
    writeFileSync(target, git(root, ['cat-file', 'blob', object]))
    count++
  }
  return count
}

/** A missing or diverged upstream must never silently skip the initial history. */
export function historyArguments(root: string): string[] | null {
  const head = git(root, ['rev-parse', '--verify', 'HEAD'], true).toString().trim()
  if (!head) return null
  // TruffleHog mangles POSIX-style file URLs on Windows (file:///G:/… → G:/G:/…)
  // and rejects bare paths; only file://<drive>:/… clones correctly there.
  const repoUri =
    process.platform === 'win32' ? `file://${root.replaceAll('\\', '/')}` : pathToFileURL(root).href
  const args = ['git', repoUri, '--branch=HEAD']
  const upstream = git(root, ['rev-parse', '--verify', '@{upstream}'], true).toString().trim()
  if (!upstream) return args
  const base = git(root, ['merge-base', head, upstream], true).toString().trim()
  if (!base) return args
  const ahead = git(root, ['rev-list', '--count', `${base}..${head}`])
    .toString()
    .trim()
  if (ahead === '0') return null
  return [...args, `--since-commit=${base}`]
}

export function exclusionPatterns(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n')
}

/** Do not print TruffleHog's Raw, RawV2, ExtraData or unredacted diagnostics. */
export function findingSummaries(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const result = JSON.parse(line)
      const metadata = result.SourceMetadata?.Data
      const source = metadata?.Filesystem ?? metadata?.Git
      return JSON.stringify({
        detector: result.DetectorName ?? 'inconnu',
        file: source?.file ?? 'source non précisée',
        line: source?.line,
        commit: metadata?.Git?.commit,
      })
    })
}

function removeSnapshot(directory: string): void {
  const tempRoot = realpathSync(tmpdir())
  const actual = realpathSync(directory)
  // Recursive cleanup is limited to the exact fresh directory created for this run.
  if (dirname(actual) !== tempRoot || !relative(tempRoot, actual).startsWith(tempPrefix)) {
    throw new Error('Nettoyage refusé : répertoire temporaire hors du périmètre attendu.')
  }
  rmSync(actual, { recursive: true, force: true })
}

export function runSecretScan(mode = '--staged', root = projectRoot): number {
  if (!['--staged', '--pre-commit', '--pre-push', '--unpushed', '--all'].includes(mode)) {
    throw new Error('Usage : bun run secrets:check [--staged|--pre-push|--all]')
  }
  const binary =
    Bun.which('trufflehog') ??
    join(
      root,
      '.tools',
      'trufflehog',
      process.platform === 'win32' ? 'trufflehog.exe' : 'trufflehog',
    )
  if (!existsSync(binary)) {
    throw new Error(
      'TruffleHog absent. Windows : pwsh -File tools/install-trufflehog.ps1 ; Linux : installer TruffleHog 3.97.4 dans PATH.',
    )
  }
  const directory = mkdtempSync(join(tmpdir(), tempPrefix))
  try {
    const excludeFile = join(directory, 'exclude.txt')
    writeFileSync(
      excludeFile,
      exclusionPatterns(readFileSync(join(root, 'scripts/trufflehog-exclude-paths.txt'), 'utf8')),
    )
    let args: string[]
    if (mode === '--all') {
      args = ['filesystem', root, '--max-symlink-depth=0']
      console.log('TruffleHog : fichiers du projet, y compris .env et fichiers non suivis.')
    } else if (mode === '--pre-push' || mode === '--unpushed') {
      const history = historyArguments(root)
      if (!history) {
        console.log('TruffleHog : aucun commit HEAD à analyser.')
        return 0
      }
      args = history
      console.log('TruffleHog : historique HEAD non envoyé, ou historique complet sans base.')
    } else {
      const snapshot = join(directory, 'index')
      mkdirSync(snapshot)
      const count = snapshotIndex(root, snapshot)
      if (!count) {
        console.log('TruffleHog : aucun fichier ajouté ou modifié dans l’index.')
        return 0
      }
      args = ['filesystem', snapshot, '--max-symlink-depth=0']
      console.log(`TruffleHog : ${count} fichier(s) depuis les blobs de l’index.`)
    }
    const result = Bun.spawnSync(
      [
        binary,
        ...args,
        '--no-verification',
        '--no-update',
        '--results=verified,unknown,unverified',
        '--fail',
        '--fail-on-scan-errors',
        '--json',
        `--exclude-paths=${excludeFile}`,
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' },
    )
    const findings = findingSummaries(result.stdout.toString())
    for (const summary of findings) console.error(`Secret potentiel : ${summary}`)
    if (findings.length || result.exitCode === 183) {
      console.error('Scan bloqué : examiner les secrets potentiels ; aucune clé vérifiée en ligne.')
      return 183
    }
    if (result.exitCode !== 0) {
      console.error(`TruffleHog a échoué (code ${result.exitCode}) ; diagnostics bruts masqués.`)
      return result.exitCode || 1
    }
    console.log('TruffleHog : aucun résultat signalé, vérification réseau désactivée.')
    return 0
  } finally {
    removeSnapshot(directory)
  }
}

if (import.meta.main) {
  try {
    if (process.argv.length > 3) throw new Error('Un seul mode de scan est accepté.')
    process.exitCode = runSecretScan(process.argv[2])
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Sortie TruffleHog JSON invalide.' : String(error))
    process.exitCode = 1
  }
}
