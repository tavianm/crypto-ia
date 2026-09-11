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
