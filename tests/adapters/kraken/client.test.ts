import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createKrakenClient,
  KrakenApiError,
  KrakenTransportError,
} from '../../../src/adapters/kraken/client.ts'

// Clés de test anonymes — jamais de vraie valeur d’environnement ni de secret de compte.
const CLE_TEST = 'fausse-cle-lecture-seule'
const SECRET_TEST = 'KkIlKCZc'
const NONCE_TEST = 1726088400000n
/** Plus petit entier non représentable exactement en number JS (2^53 + 1). */
const NONCE_GEANT = 9007199254740993n
const CHEMIN_BALANCE = '/0/private/Balance'

/**
 * Vecteur API-Sign primaire, dérivé indépendamment de l’implémentation (sha256sum + openssl dgst,
 * 2026-09-11) :
 *   secret base64 : `KkIlKCZc` → 6 octets `2a422528265c` (décodé, utilisé comme clé HMAC)
 *   nonce         : 1726088400000
 *   corps POST    : `nonce=1726088400000`
 *   chemin URI    : `/0/private/Balance`
 *   SHA256(nonce + corps) hex : 31b9743743cd133ae40e8db763a90fb18daad082151aaf9ce365c8be0080e884
 *   API-Sign = base64(HMAC-SHA512(base64decode(secret), chemin + SHA256_hex(nonce + corps)))
 */
const SIGN_BALANCE =
  'EVFONKpZvTDjsSkGuiaYEo+q1lE3+2nwtjPTWXpxHa0MzxegPirFzPji9NPLIi4ak+l7kInbjvYdRZHF4zfZHg=='

/**
 * Vecteur nonce géant (2^53 + 1), mêmes secret, corps et chemin que le primaire :
 *   nonce = 9007199254740993 — exact en bigint ; s’il transitait par un number JS, il serait
 *   arrondi à 9007199254740992 et le corps comme la signature divergeraient.
 */
const SIGN_NONCE_GEANT =
  'WWXShQIF6NG/wGO1D9an6LjWh7tmh+e2bSe5tRoU9lGPC2O13cIOh2tzJRNSzaJTGYyHyqEckbdb4g/DdTMpUQ=='

/**
 * Vecteur secret alternatif — falsifie un base64decode manquant :
 *   secret base64 : `dGVzdC1zZWNyZXQ=` → `test-secret` ; nonce, corps et chemin identiques au primaire.
 */
const SIGN_SECRET_ALTERNATIF =
  '6T6/GANziZcIDPj9BKmbzHCsGytuiczEn0GzwsTK8MgfT/GGedKipNUL521RvYK7YL8mc85dDWq/T1QLtjB/QA=='

type RequeteCapture = { path: string; body: string; headers: Record<string, string> }

/** Transport injecté qui enregistre chaque requête au lieu de toucher au réseau. */
function transportEspion(reponse: { status: number; body: unknown }) {
  const requetes: RequeteCapture[] = []
  const transport = async (requete: RequeteCapture) => {
    requetes.push({ ...requete, headers: { ...requete.headers } })
    return reponse
  }
  return { transport, requetes }
}

/** Extrait le nonce d’un corps privé `nonce=<entier>` et le relit comme bigint. */
function nonceDe(corps: string): bigint {
  const capture = /^nonce=(\d+)$/.exec(corps)
  const entier = capture?.[1]
  if (entier === undefined) throw new Error(`corps privé sans nonce entier pur : ${corps}`)
  return BigInt(entier)
}

describe('signature API-Sign', () => {
  test('envoie la signature attendue sur les entrées déterministes (secret décodé, SHA-256 interne)', async () => {
    const espion = transportEspion({ status: 200, body: { error: [], result: {} } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      nonceProvider: () => NONCE_TEST,
      transport: espion.transport,
    })

    await client.fetchBalance()

    expect(espion.requetes).toHaveLength(1)
    const requete = espion.requetes[0]!
    expect(requete.path).toBe(CHEMIN_BALANCE)
    expect(requete.body).toBe('nonce=1726088400000')
    expect(requete.headers['API-Key']).toBe(CLE_TEST)
    expect(requete.headers['API-Sign']).toBe(SIGN_BALANCE)
  })

  test('utilise le nonce bigint injecté tel quel dans le corps et la signature', async () => {
    const espion = transportEspion({ status: 200, body: { error: [], result: {} } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      nonceProvider: () => NONCE_GEANT,
      transport: espion.transport,
    })

    await client.fetchBalance()

    const requete = espion.requetes[0]!
    // Un nonce passé par un number JS arrondirait 2^53 + 1 → corps et signature divergeraient.
    expect(requete.body).toBe('nonce=9007199254740993')
    expect(requete.headers['API-Sign']).toBe(SIGN_NONCE_GEANT)
  })

  test('dérive la clé HMAC du secret base64 décodé, pas de sa forme encodée', async () => {
    const espion = transportEspion({ status: 200, body: { error: [], result: {} } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: 'dGVzdC1zZWNyZXQ=',
      nonceProvider: () => NONCE_TEST,
      transport: espion.transport,
    })

    await client.fetchBalance()

    // Si le secret restait en base64 comme clé HMAC, la signature divergerait du vecteur.
    const requete = espion.requetes[0]!
    expect(requete.headers['API-Sign']).toBe(SIGN_SECRET_ALTERNATIF)
  })
})

describe('nonce et erreurs', () => {
  test('le nonce par défaut est bigint strictement croissant malgré une milliseconde répétée', async () => {
    const espion = transportEspion({ status: 200, body: { error: [], result: {} } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      clock: () => 1726088400000,
      transport: espion.transport,
    })

    await client.fetchBalance()
    await client.fetchBalance()

    expect(espion.requetes).toHaveLength(2)
    const corps1 = espion.requetes[0]!.body
    const corps2 = espion.requetes[1]!.body
    // Sérialisation entière pure — jamais la notation d’un number (exposant, décimales).
    expect(corps1).toMatch(/^nonce=\d+$/)
    expect(corps2).toMatch(/^nonce=\d+$/)
    // L’horloge injectée alimente le nonce par défaut (premier appel du process pour ce client).
    expect(nonceDe(corps1)).toBe(1726088400000n)
    // La garde monotone s’applique même quand l’horloge répète la même milliseconde.
    expect(nonceDe(corps2)).toBeGreaterThan(nonceDe(corps1))
  })

  test('convertit une erreur Kraken error[] en KrakenApiError citant le code sans valeur sensible', async () => {
    const espion = transportEspion({
      status: 200,
      body: { error: ['EAPI:Rate limit'], result: null },
    })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      nonceProvider: () => NONCE_TEST,
      transport: espion.transport,
    })

    const erreur = await client.fetchBalance().then(
      () => {
        throw new Error('fetchBalance aurait dû rejeter sur error[]')
      },
      (cause: unknown) => cause,
    )

    expect(erreur).toBeInstanceOf(KrakenApiError)
    const erreurApi = erreur as KrakenApiError
    expect(erreurApi.name).toBe('KrakenApiError')
    expect(erreurApi.message).toContain('EAPI:Rate limit')
    expect(erreurApi.codes).toEqual(['EAPI:Rate limit'])
    expect(erreurApi.message).not.toContain(CLE_TEST)
    expect(erreurApi.message).not.toContain(SECRET_TEST)
  })

  test('convertit un échec du transport injecté en KrakenTransportError citant la cause', async () => {
    const transport = async () => {
      throw new Error('réseau injoignable')
    }
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      nonceProvider: () => NONCE_TEST,
      transport,
    })

    const erreur = await client.fetchBalance().then(
      () => {
        throw new Error('fetchBalance aurait dû rejeter sur un échec du transport')
      },
      (cause: unknown) => cause,
    )

    expect(erreur).toBeInstanceOf(KrakenTransportError)
    const erreurTransport = erreur as Error
    expect(erreurTransport.name).toBe('KrakenTransportError')
    expect(erreurTransport.message).toContain('réseau injoignable')
    expect(erreurTransport.message).not.toContain(CLE_TEST)
    expect(erreurTransport.message).not.toContain(SECRET_TEST)
  })

  test('requête exactement /0/private/Balance avec en-têtes signés et renvoie la carte brute', async () => {
    const carte = { XXBT: '0.00125000', XETH: '8.0000000000' }
    const espion = transportEspion({ status: 200, body: { error: [], result: carte } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      nonceProvider: () => NONCE_TEST,
      transport: espion.transport,
    })

    const balance = await client.fetchBalance()

    expect(espion.requetes).toHaveLength(1)
    const requete = espion.requetes[0]!
    expect(requete.path).toBe(CHEMIN_BALANCE)
    expect(requete.headers['API-Key']).toBeDefined()
    expect(requete.headers['API-Sign']).toBeDefined()
    expect(balance).toEqual(carte)
  })

  test('requête /0/public/Ticker avec les paires demandées et sans en-têtes signés', async () => {
    const resultat = {
      XBTUSDT: { c: ['54370.1', '1.20'] },
      ETHUSDT: { c: ['4312.5', '2.00'] },
      SOLUSDT: { c: ['208.75', '5.00'] },
    }
    const espion = transportEspion({ status: 200, body: { error: [], result: resultat } })
    const client = createKrakenClient({
      apiKey: CLE_TEST,
      apiSecretBase64: SECRET_TEST,
      transport: espion.transport,
    })

    const ticker = await client.fetchTicker(['XBTUSDT', 'ETHUSDT', 'SOLUSDT'])

    expect(espion.requetes).toHaveLength(1)
    const requete = espion.requetes[0]!
    // Endpoint public : paire en paramètre de requête, jamais d’en-tête signé.
    expect(requete.path).toBe('/0/public/Ticker?pair=XBTUSDT,ETHUSDT,SOLUSDT')
    expect(requete.headers['API-Key']).toBeUndefined()
    expect(requete.headers['API-Sign']).toBeUndefined()
    expect(ticker).toEqual(resultat)
  })

  test('le client n’expose aucune méthode générique de requête privée (grep statique)', () => {
    const source = readFileSync(
      join(import.meta.dir, '..', '..', '..', 'src', 'adapters', 'kraken', 'client.ts'),
      'utf8',
    )
    expect(source).not.toContain('requestPrivate')
    expect(source).not.toMatch(/\/0\/private\/\$\{/)
    expect(source).toContain('/0/private/Balance')
  })
})
