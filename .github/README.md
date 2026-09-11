# Automatisation GitHub

Les workflows utilisent Bun depuis `.bun-version` et Node 24 pour les outils de
développement. La CI exécute installation verrouillée, lint, typecheck, contrôle
des licences, tests et build sous Linux et Windows. Les titres de
PR suivent Conventional Commits pour produire un historique de squash exploitable
par Release Please, par exemple `feat: ajouter une source de prix`.

Dependabot propose les mises à jour chaque lundi, sans fusion automatique.
L'écosystème `bun` maintient `package.json` et le verrou texte `bun.lock` ;
`github-actions` suit les références des actions.
[Support officiel de Bun par Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#bun).

## Recherche de secrets

TruffleHog analyse les commits d'une PR ou d'un push. Un lancement manuel analyse
l'historique complet de la branche sélectionnée. Le premier push est pris en
charge par l'action. Les exclusions sont partagées avec le contrôle local dans
`scripts/trufflehog-exclude-paths.txt`.

La vérification auprès des fournisseurs de credentials est désactivée. Toutes les
catégories de détection font échouer le contrôle, y compris les résultats non
vérifiés ; une détection peut donc demander une revue de faux positif. Le workflow
n'installe aucun hook local.
[Fonctionnement de l'action TruffleHog](https://github.com/trufflesecurity/trufflehog/blob/v3.97.4/action.yml).

Lors d'une mise à jour de l'action, mettre aussi à jour son entrée `version` :
elle fixe la version du conteneur utilisé et évite le téléchargement de `latest`.

## Préparer une release

Le dépôt cible est [tavianm/crypto-ia](https://github.com/tavianm/crypto-ia).
Le manifest démarre à `0.0.0` car aucun tag de release n'existe à l'initialisation ;
la première version prévue est `0.1.0`. La version du package local ne constitue
pas à elle seule une release publiée.

Le workflow **Release Please** se lance uniquement à la demande sur `main`.
Il prépare une PR contenant la version et le changelog à partir des commits
éligibles. Après revue et fusion de cette PR, relancer le workflow pour créer le
tag `crypto-ia/vX.Y.Z` et la GitHub Release. Il ne publie aucun paquet npm et ne
déploie aucun service. Sans changement éligible, il peut ne rien créer.

Le jeton intégré `GITHUB_TOKEN` est utilisé par défaut. Autoriser la création de
PR par GitHub Actions dans les paramètres du dépôt si nécessaire. Les PR et tags
créés avec ce jeton ne déclenchent pas les autres workflows. Pour permettre la CI
automatique sur les PR de release, définir le secret facultatif
`RELEASE_PLEASE_TOKEN` avec un jeton dédié au dépôt, ayant les permissions
Contents, Issues et Pull requests en écriture. Une GitHub App est une autre option
lorsque le projet grandit.
[Credentials et déclenchement des workflows Release Please](https://github.com/googleapis/release-please-action/tree/v5.0.0#github-credentials).

Avec le jeton intégré, lancer manuellement **CI** et **Secret scan** sur la branche
de release avant sa fusion et vérifier son titre. Une exécution manuelle utilise
`workflow_dispatch` ; elle ne remplace pas forcément les contrôles `pull_request`
imposés par les règles de branche. Dans ce cas, configurer le jeton dédié avant la
release.

La stratégie `node` met à jour `package.json` et `CHANGELOG.md`. Lors de la revue
d'une PR de release, vérifier `bun install --frozen-lockfile` ; si une évolution du
format Bun nécessite de modifier le verrou avec la version, régénérer et inclure
`bun.lock` dans cette PR.

## Références des actions

Les SHA ont été vérifiés dans les dépôts officiels le 11 septembre 2026 :

| Action | Version |
| --- | --- |
| [actions/checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | 7.0.1 |
| [actions/setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0) | 7.0.0 |
| [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun/releases/tag/v2.2.0) | 2.2.0 |
| [googleapis/release-please-action](https://github.com/googleapis/release-please-action/releases/tag/v5.0.0) | 5.0.0 |
| [trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog/releases/tag/v3.97.4) | 3.97.4 |
