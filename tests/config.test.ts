import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'

describe('startup configuration boundary', () => {
  test('starts offline in shadow mode without credentials', () => {
    expect(loadConfig({})).toEqual({ runMode: 'shadow', liveTradingEnabled: false })
  })

  test.each(['live', 'semi-auto', 'paper', ''])('rejects unsupported mode %j', (runMode) => {
    expect(() => loadConfig({ RUN_MODE: runMode })).toThrow('RUN_MODE')
  })

  test.each(['true', '1', 'False', ''])('rejects ambiguous trading flag %j', (flag) => {
    expect(() => loadConfig({ ENABLE_LIVE_TRADING: flag })).toThrow('ENABLE_LIVE_TRADING')
  })

  test('does not expose supplied environment values in errors', () => {
    const value = 'sensitive-fixture-value'
    try {
      loadConfig({ RUN_MODE: value })
      throw new Error('Expected configuration rejection')
    } catch (error) {
      expect(String(error)).not.toContain(value)
    }
  })

  test('cannot turn on live trading by mutating the validated configuration', () => {
    const config = loadConfig({ RUN_MODE: 'shadow', ENABLE_LIVE_TRADING: 'false' })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Reflect.set(config, 'liveTradingEnabled', true)).toBe(false)
    expect(config.liveTradingEnabled).toBe(false)
  })
})

describe('loadObserveConfig', () => {
  /** Retourne l'erreur levée par l'action, ou échoue si l'action n'en a levé aucune. */
  function erreurLeveePar(action: () => unknown): Error {
    try {
      action()
    } catch (e) {
      return e as Error
    }
    throw new Error('aucun refus typé n’a été levé')
  }

  test('force le mode shadow et expose les clés Kraken fournies', async () => {
    const module = await import('../src/config.ts')
    expect(typeof module.loadObserveConfig).toBe('function')
    const config = module.loadObserveConfig({
      KRAKEN_API_KEY: 'fake-key',
      KRAKEN_API_SECRET: 'fake-secret',
    })
    expect(config.runMode).toBe('shadow')
    expect(config.kraken).toEqual({ apiKey: 'fake-key', apiSecretBase64: 'fake-secret' })
    expect(config.replayDir).toBeUndefined()
  })

  test('retient le répertoire de replay et tolère l’absence de clés', async () => {
    const module = await import('../src/config.ts')
    expect(typeof module.loadObserveConfig).toBe('function')
    const config = module.loadObserveConfig({}, { replayDir: 'fixtures/kraken/' })
    expect(config.runMode).toBe('shadow')
    expect(config.kraken).toBeNull()
    expect(config.replayDir).toBe('fixtures/kraken/')
  })

  test('échoue sans clés et sans répertoire de replay, sans exposer l’environnement', async () => {
    const module = await import('../src/config.ts')
    expect(typeof module.loadObserveConfig).toBe('function')
    const leurre = 'valeur-environnement-fictive-a-ne-pas-exposer'
    const erreur = erreurLeveePar(() => module.loadObserveConfig({ KRAKEN_HINT: leurre }))
    expect(erreur.message.length).toBeGreaterThan(0)
    expect(erreur.message).not.toContain(leurre)
  })

  test('rejette un mode d’exécution autre que shadow sans exposer les valeurs', async () => {
    const module = await import('../src/config.ts')
    expect(typeof module.loadObserveConfig).toBe('function')
    const erreur = erreurLeveePar(() => module.loadObserveConfig({ RUN_MODE: 'mode-inconnu' }))
    expect(erreur.message).toContain('RUN_MODE')
    expect(erreur.message).not.toContain('mode-inconnu')
    const erreurAvecCles = erreurLeveePar(() =>
      module.loadObserveConfig({
        RUN_MODE: 'mode-inconnu',
        KRAKEN_API_KEY: 'fake-key',
        KRAKEN_API_SECRET: 'fake-secret',
      }),
    )
    expect(erreurAvecCles.message).toContain('RUN_MODE')
    expect(erreurAvecCles.message).not.toContain('fake-key')
    expect(erreurAvecCles.message).not.toContain('fake-secret')
  })
})
