# Dépannage

| Symptôme | Vérification |
| --- | --- |
| `bun` introuvable | Installer la version `.bun-version`, puis rouvrir le terminal |
| Verrou incohérent | Restaurer le verrou attendu ou faire une mise à jour de dépendance explicite avec `bun install` |
| Hook TruffleHog échoue | Installer le binaire avec `tools/install-trufflehog.ps1` sur Windows, ou via la release officielle dans PATH |
| RUN_MODE rejeté | Le seul mode implémenté est `shadow` |
| Démarrage puis arrêt | Comportement attendu du scaffold ; les agents permanents restent à implémenter |
| Pas de CI sur une PR Release Please | Lire les permissions/token décrits dans `.github/README.md` |

Ne pas contourner un hook défaillant : corriger la cause puis relancer le contrôle concerné.
