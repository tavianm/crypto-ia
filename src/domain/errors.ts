export type DomainField = 'assets' | 'price' | 'price.quote' | 'quoteCurrency' | 'units' | string

/** Base des refus du domaine : citent le champ fautif, jamais sa valeur. */
export abstract class DomainError extends Error {
  readonly field: DomainField | null

  protected constructor(message: string, field: DomainField | null) {
    super(message)
    this.name = new.target.name
    this.field = field
  }
}

export class MissingFieldError extends DomainError {
  constructor(field: DomainField, attendu: string) {
    super(`Champ manquant ou invalide : ${field} (${attendu}).`, field)
  }
}

export class MissingPriceError extends DomainError {
  constructor(code: string) {
    super(`Prix manquant pour un actif détenu ou ciblé : ${code}.`, 'price')
  }
}

export class QuoteMismatchError extends DomainError {
  constructor(code: string, attendu: string) {
    super(`Devise de cote incohérente pour l'actif ${code} : attendu ${attendu}.`, 'price.quote')
  }
}

export class MixedQuoteCurrencyError extends DomainError {
  constructor() {
    super('Devises de cote mêlées : une seule devise est autorisée par snapshot.', 'quoteCurrency')
  }
}

export class ScaleMismatchError extends DomainError {
  constructor(attendu: string) {
    super(`Échelle ou signe incompatible : ${attendu}.`, 'units')
  }
}
