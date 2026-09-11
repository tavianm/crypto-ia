import { loadConfig } from './config.ts'

try {
  const config = loadConfig(process.env)
  console.log(
    JSON.stringify(
      {
        application: 'crypto-ia',
        status: 'scaffold-ready',
        ...config,
        integrations: 'not-configured',
        message: 'Socle initialisé. Ingestion, agents et exécution restent à implémenter.',
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Configuration invalide.')
  process.exitCode = 1
}
