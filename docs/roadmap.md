# Roadmap

Référence : 11 septembre 2026. Cette roadmap transforme le plan fourni en étapes vérifiables. Elle ne constitue pas un état de déploiement.

## S0 — Initialiser le dépôt

**Périmètre de l'initialisation actuelle :** socle Bun/TypeScript, configuration du workflow de développement, CLI d'état locale, architecture et sources. La CLI annonce `shadow` et des connecteurs désactivés. Les validations locales du socle ne démontrent aucune capacité d'ingestion ou d'analyse de portefeuille.

La disponibilité de CI et des releases sur GitHub dépend de la configuration du dépôt distant. Leur exécution réelle doit être distinguée des fichiers de workflow présents dans le dépôt.

## S1 — Produire une simulation reproductible hors ligne

- Définir les types d'actifs, de montants, de prix et de snapshots, avec des exemples synthétiques et sans donnée de compte réelle.
- Écrire une valorisation déterministe, un calcul d'écart à une allocation configurée et des propositions simulées tenant compte d'hypothèses explicites de frais.
- Journaliser entrées, versions de règles, refus et résultats ; produire un rapport lisible sans LLM.

**Terminé quand :** le même jeu d'entrée et la même politique produisent le même résultat, les erreurs d'unité et données manquantes sont refusées, et aucun code ne peut envoyer d'ordre.

## S2 — Observer un compte spot en lecture seule

- Choisir l'exchange, le compte, les actifs, la devise de référence et la fréquence d'observation.
- Définir puis tester un connecteur de lecture sur des réponses enregistrées : limites de débit, reprise après interruption, pagination et horodatage.
- Configurer séparément une clé limitée à la lecture ; capturer les réponses utiles sans conserver de secrets.
- Comparer les positions et la valorisation calculées avec une référence vérifiable du compte.

**Terminé quand :** une interruption et une répétition de données n'altèrent pas les positions, la fraîcheur est visible, les logs sont expurgés et la simulation reste isolée de toute API d'ordre.

## S3 — Ajouter les explications locales

- Évaluer un serveur LLM sur le poste réel. Vérifier d'abord l'environnement d'hébergement compatible avec llmCLI et mesurer le budget mémoire/contexte.
- Construire un adaptateur optionnel qui reçoit des résultats synthétiques ou minimisés et renvoie une explication structurée.
- Évaluer des cas contradictoires, des sorties invalides, des textes hostiles provenant des sources et l'indisponibilité du modèle.

**Terminé quand :** les explications restent traçables aux données fournies, les assertions inventées sont détectées dans les cas d'évaluation et la CLI fonctionne sans modèle. Les performances annoncées dans le plan ne servent pas de résultat de test.

## S4 — Rendre la boucle durable et observable

- Définir les exigences de disponibilité et choisir un hôte permanent ; le desktop ne suffit pas si son arrêt doit interrompre la surveillance.
- Tester les contrats d'un adaptateur factory/NATS sur des événements synthétiques, puis décider si le gain d'orchestration justifie le service supplémentaire.
- Prévoir reprise, sauvegarde/restauration du journal, déduplication, métriques de fraîcheur et état dégradé.
- Étudier un export cortex seulement après vérification de sa maturité et de son schéma ; son absence ne doit pas bloquer le registre de portefeuille.

**Terminé quand :** un scénario arrêt/reprise produit un état cohérent, les problèmes sont visibles et un runbook permet de restaurer les données. Toute notification à un tiers ou à un canal externe est configurée dans cette étape, pas implicitement à l'initialisation.

## S5 — Évaluer le cloud sur un usage borné

- Choisir une offre d'API applicative et un modèle disponibles au moment de l'intégration ; fixer coûts maximums, délais, quotas et données autorisées à sortir.
- Comparer les explications cloud et locales sur les mêmes jeux d'évaluation.
- Tester l'épuisement du budget, les erreurs fournisseur et le repli vers un rapport sans modèle.

**Terminé quand :** l'usage est mesuré et borné, les secrets restent hors contexte et aucune panne cloud ne suspend les contrôles déterministes. Le worker portefeuille Z.ai du plan doit être redéfini : le Coding Plan ne couvre pas les appels directs d'une application autonome hors accord écrit. [Conditions Z.ai consultées le 11 septembre 2026](https://docs.z.ai/legal-agreement/subscription-terms).

## S6 — Concevoir une éventuelle exécution avec validation humaine

Cette étape est hors périmètre du socle et de la première boucle shadow. Elle nécessite une spécification dédiée : environnement de test de l'exchange, autorisation d'un ordre précis, durée de validité, limites déterministes, idempotence, réconciliation des exécutions partielles et arrêt global. Les contrôles doivent être exécutés au moment de l'envoi, avec l'état courant.

**Terminé quand :** les scénarios de panne, reprise, double soumission, approbation expirée et exécution partielle sont démontrés dans l'environnement de test, puis qu'un périmètre réel précis est explicitement décidé. Aucun critère de cette étape n'est rempli par la seule activation d'une variable d'environnement.

## S7 — UI, automatisation et autres classes d'actifs

L'UI, le mode automatique, les opérations entre exchanges et les produits hors spot sont des extensions indépendantes. Chaque extension devra préciser ses exigences métier, les droits du fournisseur, ses contrôles et son schéma de données. Les agents ne seront pas déclarés « inchangés » sans réévaluation des hypothèses de calcul.

Les projets `roxabi-boilerplate` et `roxabi-live` restent des pistes à examiner lorsque les vues et opérations utiles seront connues. Une compatibilité d'intégration n'est pas déduite de leur appartenance à la même organisation.
