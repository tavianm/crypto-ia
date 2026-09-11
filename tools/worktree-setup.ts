import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

process.chdir(resolve(import.meta.dir, '..'))
for (const command of [
  ['bun', 'install', '--frozen-lockfile'],
  ['bun', 'run', 'hooks:install'],
]) {
  const result = Bun.spawnSync(command, { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) process.exit(result.exitCode)
}
if (!existsSync('.env')) copyFileSync('.env.example', '.env')
console.log('Worktree prêt. .env existant conservé ; aucun secret copié depuis un autre checkout.')
