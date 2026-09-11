# Backend

Bun et TypeScript strict ; aucun framework HTTP ni ORM à ce stade. `src/main.ts` est le point de composition ; `src/config.ts` valide les seules options implémentées.

Organiser les futures fonctions par capacité métier (marché, portefeuille, risque, décision, audit), avec ports explicites et adaptateurs séparés. Ne pas dupliquer une règle de risque par exchange/provider. Les montants financiers utiliseront des décimaux ou unités entières explicites ; ne pas utiliser des flottants sans contrat de précision.

Les propositions d'ordres n'ont aucun accès direct aux credentials. Les futurs événements porteront version de schéma, identifiant, horodatage et corrélation ; documenter leur idempotence et les erreurs.
