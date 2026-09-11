# Configuration

`.dev/stack.yml` est le contrat public de l'outillage. `.dev/dev-core.yml` désigne le dépôt GitHub ; aucun Project ni board n'est provisionné.

Bun charge `.env`. `RUN_MODE` accepte uniquement `shadow` et `ENABLE_LIVE_TRADING` uniquement `false`. Une absence prend ces valeurs par défaut ; une valeur vide ou différente provoque une erreur sans afficher sa valeur. `ENABLE_LSP_TOOL=1` est un indicateur pour les hôtes compatibles, pas une activation automatique d'un plugin d'éditeur.

Le language server TypeScript est installé localement. VS Code peut utiliser le SDK du projet. Aucun plugin Claude global n'est installé par ce socle.

Les endpoints, comptes, modèles et credentials seront ajoutés avec leurs intégrations. Ne pas inclure de clés fictives ressemblant à des secrets dans `.env.example`.
