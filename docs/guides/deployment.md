# Déploiement

Aucun déploiement applicatif, conteneur NATS, service permanent ou worker GPU n'est configuré.
`bun run build` génère seulement `dist/main.js`, exécutable avec `bun dist/main.js`.

Avant un service permanent : définir l'hôte Windows/WSL2/Linux, la supervision, les volumes, les sauvegardes et les droits d'accès. Les phases sont décrites dans `docs/roadmap.md`.

Les releases GitHub sont indépendantes du déploiement. Voir `.github/README.md` pour leur activation manuelle ; aucun paquet npm n'est publié.
