export interface RuntimeConfig {
  readonly runMode: 'shadow'
  readonly liveTradingEnabled: false
}

/** Reject unsupported modes at startup; never include environment values in errors. */
export function loadConfig(env: Record<string, string | undefined>): RuntimeConfig {
  if ((env.RUN_MODE ?? 'shadow') !== 'shadow') {
    throw new Error('RUN_MODE: seul le mode shadow est disponible.')
  }
  if ((env.ENABLE_LIVE_TRADING ?? 'false') !== 'false') {
    throw new Error('ENABLE_LIVE_TRADING: la valeur doit être false.')
  }
  return Object.freeze({ runMode: 'shadow', liveTradingEnabled: false })
}

/** Identifiants Kraken en lecture seule ; valeurs jamais journalisées ni exposées. */
export interface KrakenReadonlyCredentials {
  readonly apiKey: string
  readonly apiSecretBase64: string
}

/** Configuration d'observation (S2) : shadow forcé, clés Kraken ou répertoire de replay. */
export interface ObserveConfig {
  readonly runMode: 'shadow'
  readonly replayDir?: string
  readonly kraken: KrakenReadonlyCredentials | null
}

/**
 * Valide la configuration d'observation (S2) : mode shadow forcé, clés Kraken en
 * lecture seule ou répertoire de replay requis. Même politique que loadConfig :
 * messages citant le champ fautif, jamais une valeur d'environnement.
 */
export function loadObserveConfig(
  env: Record<string, string | undefined>,
  options?: { replayDir?: string },
): ObserveConfig {
  if ((env.RUN_MODE ?? 'shadow') !== 'shadow') {
    throw new Error('RUN_MODE: seul le mode shadow est disponible.')
  }
  // Une chaîne vide vaut absence : une clé vide ne peut jamais authentifier une requête.
  const apiKey = env.KRAKEN_API_KEY || undefined
  const apiSecret = env.KRAKEN_API_SECRET || undefined
  const replayDir = options?.replayDir
  if (apiKey !== undefined && apiSecret !== undefined) {
    const kraken: KrakenReadonlyCredentials = Object.freeze({ apiKey, apiSecretBase64: apiSecret })
    return Object.freeze({
      runMode: 'shadow',
      ...(replayDir === undefined ? {} : { replayDir }),
      kraken,
    })
  }
  if (apiKey !== undefined || apiSecret !== undefined) {
    throw new Error(
      'KRAKEN_API_KEY/KRAKEN_API_SECRET: les deux clés de lecture seule sont requises ensemble.',
    )
  }
  if (replayDir === undefined) {
    throw new Error(
      'KRAKEN_API_KEY/KRAKEN_API_SECRET: aucune clé de lecture seule fournie et aucun répertoire de replay.',
    )
  }
  return Object.freeze({ runMode: 'shadow', replayDir, kraken: null })
}
