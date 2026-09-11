/**
 * Adaptateur Kraken lecture seule (A1) : client signé sans dépendance, WebCrypto global seul.
 * Méthodes explicites uniquement — aucune requête privée générique, aucun chemin d'ordre.
 * Transport, nonce et horloge injectés ; clé et secret n'apparaissent jamais dans les erreurs.
 */

const BALANCE_PATH = '/0/private/Balance'
const DEFAULT_BASE_URL = 'https://api.kraken.com'
const ENCODER = new TextEncoder()

/** Requête préparée par le client, exécutée par le transport injecté. */
export interface KrakenRequest {
  readonly path: string
  readonly body: string
  readonly headers: Record<string, string>
}

/** Réponse brute du transport : statut HTTP et corps tel quel (objet attendu). */
export interface KrakenResponse {
  readonly status: number
  readonly body: unknown
}

/** Transport injecté : fetch réel, fixtures de replay ou espion de test. */
export type KrakenTransport = (request: KrakenRequest) => Promise<KrakenResponse>

export interface KrakenClientConfig {
  readonly apiKey: string
  readonly apiSecretBase64: string
  /** Défaut : fetch global en POST vers baseUrl. */
  readonly transport?: KrakenTransport
  /** Défaut : millisecondes de l'horloge injectée en bigint, garde monotone stricte. */
  readonly nonceProvider?: () => bigint
  /** Défaut : Date.now. */
  readonly clock?: () => number
  readonly baseUrl?: string
}

/** Carte brute de /0/private/Balance : code actif Kraken → solde en chaîne décimale. */
export type KrakenBalance = Record<string, string>

/** Dernière cote d'une paire : c[0] = prix, c[1] = volume, chaînes décimales exactes. */
export interface KrakenTickerEntry {
  readonly c: string[]
}

/** Carte brute de /0/public/Ticker : paire demandée → cote publique. */
export type KrakenTicker = Record<string, KrakenTickerEntry>

/** Erreur métier Kraken (tableau error non vide) : codes cités tels quels, sans valeur d'environnement. */
export class KrakenApiError extends Error {
  readonly codes: string[]

  constructor(codes: string[], message: string) {
    super(message)
    this.name = new.target.name
    this.codes = codes
  }
}

/** Échec du transport injecté : cite le message de la cause, jamais de valeur d'environnement. */
export class KrakenTransportError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Transport Kraken en échec : ${detail}.`)
    this.name = new.target.name
  }
}

/** Client Kraken lecture seule : méthodes explicites, aucune capacité d'écriture ni d'ordre. */
export interface KrakenClient {
  fetchBalance(): Promise<KrakenBalance>
  fetchTicker(pairs: string[]): Promise<KrakenTicker>
}

/**
 * Fabrique du client signé : transport, nonce et horloge injectables, défauts sûrs hors test.
 * Signature privée : API-Sign = base64(HMAC-SHA512(base64decode(secret), chemin + SHA256(nonce + corps))).
 */
export function createKrakenClient(config: KrakenClientConfig): KrakenClient {
  const transport = config.transport ?? defaultTransport(config.baseUrl ?? DEFAULT_BASE_URL)
  const nextNonce = config.nonceProvider ?? defaultNonceProvider(config.clock ?? Date.now)

  async function call(request: KrakenRequest): Promise<KrakenResponse> {
    try {
      return await transport(request)
    } catch (cause) {
      throw new KrakenTransportError(cause)
    }
  }

  return {
    async fetchBalance(): Promise<KrakenBalance> {
      const nonce = nextNonce()
      const body = `nonce=${nonce}`
      const headers = await signedHeaders(config, BALANCE_PATH, nonce, body)
      const response = await call({ path: BALANCE_PATH, body, headers })
      return extractResult(response.body) as KrakenBalance
    },

    async fetchTicker(pairs: string[]): Promise<KrakenTicker> {
      const path = `/0/public/Ticker?pair=${pairs.join(',')}`
      const response = await call({ path, body: '', headers: {} })
      return extractResult(response.body) as KrakenTicker
    },
  }
}

/** Transport par défaut : fetch global en POST vers baseUrl, corps et en-têtes tels quels. */
function defaultTransport(baseUrl: string): KrakenTransport {
  return async (request) => {
    const response = await fetch(`${baseUrl}${request.path}`, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
    return { status: response.status, body: await response.json() }
  }
}

/** Nonce par défaut : millisecondes de l'horloge injectée en bigint, strictement croissant. */
function defaultNonceProvider(clock: () => number): () => bigint {
  let last: bigint | null = null
  return () => {
    const candidate = BigInt(Math.trunc(clock()))
    const nonce = last !== null && candidate <= last ? last + 1n : candidate
    last = nonce
    return nonce
  }
}

/** En-têtes signés d'une requête privée : clé en clair, signature Kraken, corps de formulaire. */
async function signedHeaders(
  config: KrakenClientConfig,
  path: string,
  nonce: bigint,
  body: string,
): Promise<Record<string, string>> {
  const hashed = await crypto.subtle.digest('SHA-256', ENCODER.encode(`${nonce}${body}`))
  const innerHash = toHex(new Uint8Array(hashed))
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase64(config.apiSecretBase64),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, ENCODER.encode(`${path}${innerHash}`))
  return {
    'API-Key': config.apiKey,
    'API-Sign': encodeBase64(new Uint8Array(signature)),
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

/** Vérifie la forme { error: [], result: {...} } : codes Kraken typés, résultat brut requis. */
function extractResult(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    throw new KrakenApiError([], 'Réponse Kraken illisible : objet attendu.')
  }
  const errors = (body as { error?: unknown }).error
  if (Array.isArray(errors)) {
    const codes = errors.filter((code): code is string => typeof code === 'string')
    if (codes.length > 0) {
      throw new KrakenApiError(codes, `Erreur API Kraken : ${codes.join(', ')}.`)
    }
  }
  const result = (body as { result?: unknown }).result
  if (typeof result !== 'object' || result === null) {
    throw new KrakenApiError([], 'Réponse Kraken inattendue : résultat absent ou invalide.')
  }
  return result as Record<string, unknown>
}

/** Décode un secret base64 en octets bruts (clé HMAC), via atob global. */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Encode une signature en base64 via btoa global, octet par octet. */
function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** Empreinte en hexadécimal minuscule, forme attendue par Kraken pour le SHA-256 interne. */
function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}
