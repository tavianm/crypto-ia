# Tests

Utiliser `bun:test` dans `tests/`. Exécuter `bun run test` ou le contrôle complet `bun run check`.

Tester les frontières observables : rejet des configurations hors shadow, absence de fuite des valeurs de configuration, règles de risque et reprises d'événements quand elles seront implémentées. Les tests automatisés doivent fonctionner sans réseau, compte d'exchange, modèle LLM ou credential.

Les fixtures financières seront synthétiques. Les futurs tests d'intégration seront distincts des tests unitaires et explicitement activés. Un résultat shadow n'est ni une exécution ni une preuve de performance financière.
