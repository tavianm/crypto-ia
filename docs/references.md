# Références et hypothèses vérifiées

Consultation : 11 septembre 2026. Les README distants ont été lus via l'API GitHub en lecture seule. Les liens de révision ci-dessous figent l'état documentaire consulté ; ils ne constituent pas une validation par exécution.

Le plan fourni par l'utilisateur exprime la cible et ses contraintes matérielles. Ses marqueurs de citation internes ne permettent pas de retrouver une source vérifiable ; ils ne sont pas repris comme preuves.

## Sources Roxabi

| Source consultée | Ce qu'elle établit | Conséquence pour crypto-ia |
| --- | --- | --- |
| [factory, README à da99f56](https://github.com/Roxabi/roxabi-factory/blob/da99f561d268331ba0ee7134ebd7d187e7c34f25/README.md) | Hub Python/asyncio, canaux de conversation, workers et transport NATS ; moteur Claude CLI décrit comme principal | Étudier les contrats d'adaptation ; aucun orchestrateur de portefeuille prêt à brancher n'est démontré |
| [cortex, README à ddac29c](https://github.com/Roxabi/roxabi-cortex/blob/ddac29c50dc0d730056eec672979e4bc67c54724/README.md) | Capture et mémoire en deux services ; design finalisé en mai 2026, implémentation déclarée non commencée | Ne pas en faire un prérequis de stockage pour la première boucle |
| [llmCLI, README à 4565e3b](https://github.com/Roxabi/llmCLI/blob/4565e3b7f237966d259feed496dada2e10296425/README.md) | Serving local compatible OpenAI, catalogue de modèles et service NATS ; déploiement documenté avec Podman/Quadlet/systemd | Vérifier l'environnement avant intégration ; aucune installation native Windows ni mesure RTX 3070 n'est validée ici |
| [Boilerplate, README à 4abb241](https://github.com/Roxabi/roxabi-boilerplate/blob/4abb241090e52dad630d95ee8cc9ad76ad6420b7/README.md) | Référence locale de monorepo Bun/TurboRepo, TypeScript, Biome, TanStack Start et NestJS | Reprendre des conventions adaptées au petit socle ; ne pas importer une pile SaaS complète |
| [Plugins, README à da96737](https://github.com/Roxabi/roxabi-plugins/blob/da967375c889e98708712b10b900f993c09d9a99/README.md) | Skills, agents et hooks destinés au cycle de développement | Distinguer les agents d'ingénierie des agents métier à développer |

Les copies locales consultées, sans modification, sont `G:/Development/projects/roxabi-original` au commit `4abb241090e52dad630d95ee8cc9ad76ad6420b7` et `G:/Development/projects/roxabi-plugins` au commit `da967375c889e98708712b10b900f993c09d9a99`. Leurs README et `CLAUDE.md`, ainsi que l'`AGENTS.md` du boilerplate, ont été examinés. Ces révisions peuvent différer des versions actuelles et du plugin dev-core installé sur la machine.

Les branches par défaut constatées de factory et llmCLI sont `staging`. Le statut API de llmCLI était non archivé. La référence à `roxabi-inference` repérée dans l'organisation n'a pas pu être vérifiée : son README a répondu HTTP 404 avec l'accès disponible. Aucune migration vers ce dépôt n'est donc supposée pour crypto-ia.

Les mentions de licence diffèrent entre les copies locales et les dépôts récents. Aucun code Roxabi applicatif n'est importé par ce socle. Si une intégration reprend du code, lire la licence du commit effectivement retenu, pas le badge d'une ancienne copie.

## Sources fournisseurs

| Source officielle | Constat au 11 septembre 2026 | Décision de cadrage |
| --- | --- | --- |
| [Z.ai, conditions d'abonnement, section 4](https://docs.z.ai/legal-agreement/subscription-terms) | Les quotas Coding Plan sont réservés aux outils supportés ; les appels directs depuis des applications ou bots hors de ces outils nécessitent un accord écrit distinct | Ne pas configurer un worker portefeuille avec le quota Coding Plan |
| [Z.ai, introduction à l'API](https://docs.z.ai/api-reference/introduction) | Une API générale est documentée sous `https://api.z.ai/api/paas/v4` avec authentification Bearer et exemples de SDK | Évaluer une offre API applicative séparée pour une future intégration cloud |
| [Z.ai, aperçu Coding Plan](https://docs.z.ai/devpack/overview) | L'offre, ses modèles et le routage de certains alias évoluent | Ne pas figer les noms de modèles ou les quotas du plan initial comme des constantes techniques |

Le Coding Plan peut accompagner le développement dans ses outils supportés. Cette capacité ne prouve pas l'éligibilité des jobs périodiques de portefeuille proposés dans le plan. La disponibilité d'un accès API général pour le compte concerné et son coût restent à vérifier avant toute connexion.

## Hypothèses à mesurer ou décider

- **Matériel :** RTX 3070 8 Go et 32 Go de RAM sont des informations du plan, pas un inventaire matériel exécuté dans cette initialisation.
- **LLM local :** les estimations de 60–75 tokens/s, de 16k–32k tokens de contexte et de chargement intégral en VRAM ne sont pas vérifiées. Le choix dépendra d'un benchmark reproductible sur l'hôte et le modèle exacts.
- **Modèles :** les noms Qwen et GLM du plan sont des candidats historiques ; aucune disponibilité, licence, fenêtre de contexte ou qualité n'est attestée pour l'usage futur.
- **Contrats :** les sujets NATS proposés par le plan ne sont pas présentés comme les sujets officiels factory. Leur adaptation devra être testée à une révision épinglée.
- **Portefeuille :** exchange, compte, actifs, source de valorisation, règles et budgets n'ont pas encore été choisis.
- **Disponibilité :** aucun hôte permanent, sauvegarde, objectif de reprise ou monitoring n'est déployé.
- **Autres briques :** boilerplate, live, idna et l'extension multi-actifs restent des pistes ; leur adéquation métier ne résulte pas des descriptions de l'organisation.

Mettre à jour ce document à chaque sélection de dépendance externe et consigner la révision utilisée avec les résultats de tests de contrat et de performance.
