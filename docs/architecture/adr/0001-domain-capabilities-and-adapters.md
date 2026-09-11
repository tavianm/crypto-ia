---
title: "ADR-0001 : capacités métier et adaptateurs"
description: "Axe de décomposition primaire : capacités métier indépendantes des exchanges et des fournisseurs."
date: 2026-09-11
axial: true
---

## Status

Accepted

Décision retenue pour l'initialisation locale à partir du plan utilisateur. Elle ne constitue ni une activation du trading réel ni une validation des intégrations externes encore à construire.

## Context

Le système doit surveiller des portefeuilles, proposer des allocations, appliquer des règles de risque et conserver les décisions. À terme, des workers pourront exécuter des ordres. Le plan prévoit plusieurs exchanges, classes d'actifs et fournisseurs LLM, tout en réutilisant les agents et les politiques.

Le premier incrément est limité à un exchange en lecture seule, un portefeuille crypto spot, un agent de surveillance et un agent de rebalancing simple. Il fonctionne en **shadow mode** : observation et décisions simulées, sans ordres réels. Binance est un exemple du plan ; le choix effectif de l'exchange reste à vérifier avant son intégration.

Les axes identifiés sont les suivants. Les nombres décrivent le périmètre prévu, pas des composants déjà implémentés. Le plan ne fixe aucun objectif chiffré à douze mois ; la croissance est donc qualitative.

| Axe | Périmètre du premier incrément | Extension envisagée, sans échéance garantie |
| --- | --- | --- |
| Capacités métier | 6 capacités : données marché, état portefeuille, surveillance, rebalancing, contrôle du risque, journal de décisions | Drawdown, allocation entre exchanges, explicabilité, exécution contrôlée |
| Sources et lieux d'exécution | 1 exchange, 1 portefeuille | Autres exchanges et brokers, plusieurs comptes |
| Fournisseurs de raisonnement | 1 cible locale via llmCLI | Z.ai si l'usage prévu est autorisé par l'offre ; OpenAI facultatif avec accès API distinct |
| Classes d'actifs | 1 classe : crypto spot | Actions, ETF puis dérivés, avec leurs contraintes propres |
| Modes de fonctionnement | 1 mode : shadow | Semi-automatique avec validation humaine, puis automatique borné |
| Infrastructure et interfaces | NATS/factory pour l'orchestration et cortex pour l'historique, comme cibles d'intégration | Interface de pilotage, supervision, stockage et déploiements supplémentaires |

Une arborescence organisée d'abord par exchange ou fournisseur LLM conduirait à recopier les calculs d'allocation, contrôles de risque et conventions de journalisation dans chaque intégration. Cette décision rend cette duplication identifiable avant la multiplication des connecteurs.

Les réponses aux questions de décomposition sont dérivées du plan : axes ci-dessus, axe primaire et justification ci-dessous, signal de dérive et dette explicites dans les conséquences. Les hypothèses complémentaires sont des choix locaux réversibles ; elles ne sont pas présentées comme des réponses verbatim de l'utilisateur.

## Options Considered

### Option A : capacités métier comme axe primaire

- **Avantages :** les mêmes politiques et cas d'usage s'appliquent aux connecteurs disponibles ; les calculs métier sont testables avec des données déterministes ; chaque capacité a une responsabilité identifiable.
- **Coûts :** il faut définir les contrats entre capacités et traduire les différences des fournisseurs ; les évolutions transversales exigent parfois plusieurs changements de contrat.
- **Dérive observable :** un module de risque ou de rebalancing importe un SDK d'exchange ou choisit un modèle LLM directement.

### Option B : exchange ou broker comme axe primaire

- **Avantages :** un premier connecteur est simple à assembler ; les particularités de son API restent proches du code qui les consomme.
- **Coûts :** risque, allocation et audit sont recopiés au fil des exchanges ; les décisions consolidées nécessitent de réconcilier plusieurs implémentations métier.
- **Dérive observable :** une correction de limite d'exposition doit être reproduite dans chaque worker d'exchange.

### Option C : agent, fournisseur LLM ou worker de déploiement comme axe primaire

- **Avantages :** organisation proche du routage de la factory et des services opérés ; chaque fournisseur peut être développé rapidement en isolation.
- **Coûts :** règles métier et prompts deviennent couplés ; un changement de modèle, transport ou déploiement entraîne des changements de politiques sans nécessité fonctionnelle.
- **Dérive observable :** chaque agent ou fournisseur possède sa propre interprétation des limites de risque et son propre format de décision.

## Decision

**Primary axis :** `capacités métier`.

**Reason category :** Composition, avec un objectif de stabilité.

**Rationale :** les capacités et leurs contrats composent les agents de portefeuille. Les exchanges, fournisseurs LLM et transports réalisent des ports secondaires. Leur multiplication ne doit pas multiplier les implémentations de risque, d'allocation ou d'audit.

Une nouvelle capacité ajoute un module cohérent qui réutilise les contrats existants. Une nouvelle instance d'un axe secondaire ajoute un adaptateur et sa configuration de composition. Une extension reste susceptible d'introduire un besoin métier nouveau : on fait alors évoluer le contrat explicitement, sans prétendre que toutes les classes d'actifs sont interchangeables.

### Règles de dépendance

1. Le **domaine** contient les types et invariants métier, calculs d'allocation et règles de risque. Il ne connaît aucun SDK fournisseur, protocole NATS, client HTTP, secret ou détail de stockage.
2. Les **cas d'usage applicatifs** orchestrent les capacités et définissent les ports nécessaires : données marché, état portefeuille, raisonnement, publication/journalisation et simulation. Ils dépendent du domaine et de contrats neutres.
3. Les **adaptateurs** traduisent les APIs d'exchange, llmCLI, fournisseurs cloud, NATS, factory et cortex vers ces contrats. Ils dépendent des ports et du domaine ; le cœur ne dépend pas d'eux.
4. La **composition de l'application** choisit les adaptateurs, charge leur configuration et les injecte. L'infrastructure et le packaging en workers ne déterminent pas les frontières métier.
5. Les dépendances entre capacités passent par des interfaces publiques ou des contrats d'événements explicites. Les imports d'implémentations internes d'une capacité voisine sont interdits ; les dépendances circulaires sont à éviter par conception.
6. Un événement contient un contexte explicite, dont son origine et le compte/portefeuille concerné. Les sujets NATS peuvent inclure l'exchange pour le routage ; les types métier et règles de risque restent indépendants de ce nom.
7. Les spécificités réelles d'un instrument ou lieu de négociation sont représentées par des données ou capacités explicites. Les adaptateurs ne doivent pas masquer une fonctionnalité absente, ni dupliquer une politique pour contourner une restriction du contrat.

Ces frontières sont logiques : le scaffold peut commencer comme un monorepo et un petit nombre de processus. Cette décision n'impose pas un microservice pour chaque capacité.

### Matrice d'extension

| Changement | Où ajouter ou modifier | Ce qui doit être réutilisé | Critère de revue |
| --- | --- | --- | --- |
| Ajouter un deuxième exchange en lecture seule | Adaptateur marché/portefeuille, configuration de composition, tests de contrat | Surveillance, rebalancing, risque, journalisation | Aucune copie de politique par exchange ; données normalisées avec provenance |
| Ajouter un fournisseur LLM cloud | Adaptateur du port de raisonnement et règles de routage | Cas d'usage et validation des propositions | Aucune dépendance au SDK dans le cœur ; pas de secret ou clé d'exchange transmis au modèle |
| Ajouter une règle de drawdown | Capacité de risque et contrat nécessaire pour ses données | Adaptateurs qui fournissent déjà ces données | La règle s'applique aux mêmes entrées, indépendamment du fournisseur LLM |
| Ajouter des actions ou ETF | Modèle d'instrument si nécessaire, adaptateurs de données et calendrier | Capacités compatibles d'allocation et d'audit | Les différences de marché sont explicites ; aucune assimilation implicite au spot crypto |
| Passer au semi-automatique | Nouveau cas d'usage d'approbation, port d'exécution et adaptateur dédié | Décisions, politique de risque, audit | Transition distincte et explicite ; aucune activation obtenue par un simple choix de fournisseur |
| Remplacer le transport ou le stockage | Adaptateur NATS ou historique et composition | Domaine et cas d'usage | Pas de réécriture des politiques pour un changement d'infrastructure |

### Contraintes du premier incrément

- Le mode shadow est la valeur de départ. Les sorties de rebalancing sont des propositions et des résultats simulés. L'initialisation ne fournit aucun chemin activé vers la soumission d'ordres réels.
- L'ingestion de portefeuille utilise uniquement des permissions de lecture. Les identifiants restent hors des prompts, de la mémoire LLM, des journaux et du dépôt.
- Les agents proposent ; le moteur de règles codé valide ou refuse. Une réponse de modèle, même issue d'une double vérification cloud, ne remplace pas la politique de risque.
- Le portefeuille initial est spot, sans levier. Les dérivés et leurs contraintes constituent une extension métier ultérieure.
- Les décisions simulées, leurs données de contexte et les résultats de validation doivent pouvoir être retrouvés pour comparaison et audit. Les événements de simulation restent distinguables des événements d'exécution réels futurs.
- L'exécution réelle, lorsqu'elle sera conçue et autorisée, sera isolée dans des workers dédiés, avec vérification des politiques et journalisation. Le plan prévoit une étape de validation humaine avant toute automatisation bornée et une pause globale.
- Les intégrations Roxabi et fournisseurs sont des cibles, pas des fonctionnalités acquises. Les versions, modèles, endpoints, limites matérielles et droits d'usage doivent être vérifiés à leur intégration. Les références `[web:…]` du plan ne constituent pas une preuve consultable dans ce dépôt.

## Consequences

### Positive

- Les règles de risque et calculs d'allocation disposent d'une implémentation commune et vérifiable avec des entrées contrôlées.
- Un connecteur ou modèle peut être remplacé sans réécrire le cœur métier.
- Le mode shadow permet de vérifier la chaîne observation → proposition → validation → journal avant toute exécution réelle.
- La structure garde une place explicite pour les extensions de classe d'actifs et leurs différences.

### Negative (Expected Debt)

- **Coût initial de normalisation :** les contrats et types communs demandent plus de travail qu'un script propre à un exchange. **Réduction :** partir des besoins du spot et du premier exchange, puis étendre sur des besoins observés.
- **Évolution de plusieurs contrats :** un nouveau produit peut toucher portefeuille, risque et simulation. **Réduction :** versionner les contrats externes, tester les frontières et documenter les capacités non supportées.
- **Particularités difficiles à généraliser :** frais, tailles minimales, précision et calendriers ne sont pas uniformes. **Réduction :** fournir ces contraintes comme données ou capacités explicites ; garder leur traduction dans les adaptateurs.
- **Coût de cohérence entre workers :** messages retardés, dupliqués ou reçus dans le désordre peuvent affecter les vues. **Réduction :** prévoir identifiants, provenance et horodatage dans les contrats ; traiter fraîcheur, déduplication et reprise lors de la conception des flux durables.
- **Frontières exposées à la dérive :** le découpage logique peut s'éroder sans contrôle. **Réduction :** vérifier les imports et les corrections dupliquées en revue, puis automatiser les contraintes de dépendance lorsque le code existe.

### Anti-pattern signal

Grep pattern: `ccxt|binance|openai|nats` in `src/domain` et `src/app`.

Ces chemins sont les sources du cœur métier depuis S1 ; si l'implémentation en retient d'autres, cette portée doit être mise à jour avec elle. Le motif est un signal de revue, pas une interdiction de ces mots dans la documentation ou les fixtures. Dans les sources du cœur, un import fournisseur ou une branche dédiée à un fournisseur indique une fuite de l'axe secondaire ; chaque résultat doit être qualifié.

Autre signal à examiner en revue : une même correction de risque, allocation ou audit reproduite dans plusieurs adaptateurs. Un simple grep ne prouve pas l'absence de cette duplication.

### Revisit triggers

- Plus de trois corrections dupliquées entre adaptateurs sur une même responsabilité dans une semaine.
- Introduction d'une deuxième classe d'actifs ou d'une fonction de trading réel : vérifier que les contrats expriment les nouveaux invariants.
- Besoin répété de contourner un port pour représenter une spécificité fournisseur.
- Revue architecturale à six mois si le développement continue ; il s'agit d'un critère de revue, sans tâche planifiée créée par cet ADR.

### Traçabilité

Source de cadrage : plan utilisateur « Plan de mise en place détaillé Roxabi + local + cloud pour agents de portefeuilles », transmis pour l'initialisation du projet. Le guide `R-axial-adr-create` a servi de structure. Sa référence complémentaire `shared/references/axial-decomposition.md` n'était pas disponible dans l'installation consultée ; aucun contenu ne lui est attribué ici.

Le marqueur `axial: true` du frontmatter identifie l'unique ADR axial actif. Toute décision qui le remplace retire ce marqueur de cet ADR et en indique le successeur.
