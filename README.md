# crypto-ia

Socle de développement d'agents de portefeuille, initialisé avec Roxabi dev-core.
La première itération visera un portefeuille crypto spot, un exchange en lecture seule,
un agent de surveillance et un agent de rééquilibrage en mode shadow.

**État actuel : initialisation technique uniquement.** La commande de démarrage vérifie la
configuration, affiche un état JSON puis se termine. Elle ne surveille aucun portefeuille,
n'appelle aucun LLM et ne passe aucun ordre.

## Démarrer

Installer Git, Node.js 24+ (outillage) et Bun à la version de `.bun-version`.
L'installation npm de Bun fonctionne aussi sous Windows :

```powershell
npm install --global bun@1.4.2
bun install --frozen-lockfile
bun run worktree:setup
bun run start
bun run check
```

`worktree:setup` installe les hooks Lefthook et copie `.env.example` vers `.env` seulement
si celui-ci n'existe pas. Pour committer, installer aussi TruffleHog :

```powershell
powershell -NoProfile -File tools/install-trufflehog.ps1
bun run secrets:check --all
```

Sous Linux/macOS, installer TruffleHog depuis ses releases officielles et le rendre
accessible dans `PATH`. Les commandes Bun restent identiques.

## Commandes

| Commande | Effet |
| --- | --- |
| `bun run start` | Vérifie le mode shadow et affiche l'état du socle |
| `bun run dev` | Relance cette vérification à chaque modification |
| `bun run check` | Format/lint, types, tests et build |
| `bun run format` | Applique le format et les corrections Biome |
| `bun run license:check` | Contrôle les licences des dépendances installées |
| `bun run secrets:check` | Contrôle l'index Git avant commit |
| `bun run commit` | Assistant Commitizen pour les commits conventionnels |

## Documents

- [Architecture cible](docs/architecture/overview.md) et [décision axiale](docs/architecture/adr/0001-domain-capabilities-and-adapters.md).
- [Feuille de route](docs/roadmap.md) et [références vérifiées](docs/references.md).
- [Contribuer](docs/contributing.md), [configuration](docs/standards/configuration.md) et [dépannage](docs/guides/troubleshooting.md).
- [CI et releases](.github/README.md) : GitHub Actions, Dependabot, scan des secrets et Release Please sur déclenchement manuel.

Le plan local/cloud reste une cible. Le Coding Plan Z.ai est réservé à son usage autorisé
dans les outils de coding ; un futur worker portefeuille devra utiliser une API générale
adaptée. Cortex et Factory nécessitent une évaluation et des adaptateurs avant intégration.
Voir les sources et limites dans [les références](docs/references.md).

Le dépôt reprend l'intention MIT du précédent README. Les fichiers dérivés de Roxabi
sont attribués dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
