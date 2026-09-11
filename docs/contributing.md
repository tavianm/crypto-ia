# Contribuer

Suivre le démarrage du README. Utiliser une branche ou un worktree pour la prochaine fonctionnalité, puis `bun run worktree:setup` dans ce checkout.

Avant commit : `bun run check`, `bun run license:check` et `bun run secrets:check --all`. Lefthook contrôle lint, types et index Git avant commit, le message via commitlint et l'historique à pousser avant push.

Exemple de message : `feat(portfolio): add read-only balance snapshot`. `bun run commit` lance Commitizen. Ne pas committer `.env`, données de comptes ou poids GGUF.

La CI fonctionne sous Linux et Windows. N'ajouter des dépendances ou services qu'avec un usage concret et une vérification de leurs licences et de leur configuration.
