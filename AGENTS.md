# crypto-ia — instructions de développement

Lire `.dev/stack.yml` pour les commandes et `docs/architecture/adr/0001-domain-capabilities-and-adapters.md` pour les frontières d'architecture.

- Le socle démarre hors ligne en `shadow`. Aucun connecteur, agent financier ou exécuteur réel n'est implémenté.
- Le périmètre V1 est un portefeuille crypto spot, un exchange en lecture seule, surveillance et propositions de rééquilibrage simulées.
- Séparer les capacités métier des adaptateurs exchanges, NATS, mémoire et LLM. Les dépendances externes restent hors du domaine.
- Les LLM proposent ; les règles de risque seront déterministes. Les clés et données de comptes ne doivent jamais entrer dans les prompts, journaux ou fixtures.
- Ne pas activer les ordres réels en modifiant seulement une variable. Cette évolution nécessite une fonctionnalité dédiée et une autorisation explicite.
- Utiliser les dépendances verrouillées avec `bun install --frozen-lockfile`. Exécuter `bun run check`, `bun run license:check` et les scans adaptés avant livraison.
- Commits conventionnels. Pour une nouvelle fonctionnalité, préférer une branche/worktree issue de `main`. Ne pas écraser du travail ni pousser sans autorisation utilisateur.
- Les contrats `.dev/`, les docs et `.env.example` sont versionnés. `.env`, données de comptes et poids de modèles sont ignorés.
- Ne pas présenter le plan cible comme une intégration testée. Vérifier versions, licences et interfaces des projets Roxabi avant adoption.
- Entrée du workflow Roxabi : `/R-dev #N`. Les décisions durables vont dans `docs/architecture/adr/`, les frames/specs/plans dans `artifacts/` selon `.dev/stack.yml`.
