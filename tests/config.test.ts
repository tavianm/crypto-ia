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
