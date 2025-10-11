# Instructions pour les Agents IA - Crypto-IA

Ce document guide les agents IA travaillant sur le projet Crypto-IA. Il décrit l'architecture, les conventions et les workflows clés.

## Architecture Globale

Le système est composé de 5 agents spécialisés interagissant via un orchestrateur central :

```
MarketDataAgent → SentimentAnalysisAgent → TechnicalAnalysisAgent → RiskManagementAgent → ExecutionAgent
```

### Flux de Données
- `MarketDataAgent` collecte les données brutes → normalisation dans `models.MarketData`
- Analyse parallèle par `SentimentAnalysisAgent` et `TechnicalAnalysisAgent`
- `RiskManagementAgent` fusionne les analyses → génère `models.Position`
- `ExecutionAgent` transforme `Position` en ordres FreqTrade

## Conventions Importantes

### Structure des Agents
```python
class MyAgent(BaseAgent):
    async def initialize(self) -> None:
        # Configuration initiale, connexions
        pass
        
    async def process(self, data: Any) -> Any:
        # Logique métier principale
        pass
        
    async def shutdown(self) -> None:
        # Nettoyage des ressources
        pass
```

### Modèles de Données
- Utiliser les dataclasses dans `crypto_ia/models/`
- Implémenter `to_dict()` et `from_dict()` pour la sérialisation
- Valider les données avec Pydantic dans les modèles

## Workflow Développement

### Installation
```bash
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate sur Windows
pip install -r requirements.txt -r requirements-dev.txt
```

### Configuration
1. Copier `config.example.yml` vers `config.yml`
2. Configurer les clés API et paramètres des agents
3. Ajuster les modèles Ollama dans la section `agents:`

### Tests et Validation
```bash
# Lancer les tests
pytest

# Vérifier le style
flake8
black .
```

## Points d'Intégration Clés

### Ollama LLM
- Modèles configurés dans `config.yml`
- Interface via HTTP sur `localhost:11434`
- Exemples de prompts dans `agents/*.py`

### FreqTrade
- Communication via API REST
- Configurations dans la section `freqtrade:` du `config.yml`
- Wrapper dans `crypto_ia/integrations/freqtrade.py`

### Cache Redis (Optionnel)
- Activé si configuré dans `redis:` section
- Utilisé pour le cache des données de marché et des résultats d'analyse

## Bonnes Pratiques

1. Logging
```python
from loguru import logger

logger.info(f"{self.name}: Processing {symbol}")
logger.debug(f"Raw data: {data}")
```

2. Gestion des Erreurs
```python
try:
    await self.process(data)
except ExchangeError as e:
    logger.error(f"Exchange error: {e}")
    # Retry logic
except LLMError as e:
    logger.error(f"LLM error: {e}")
    # Fallback strategy
```

3. Métriques et Monitoring
- Healthchecks via `agent.health_check()`
- Métriques exposées sur `/metrics` endpoint
- Logs centralisés dans `logs/`

## Tâches Courantes

- Ajouter un nouvel agent : Hériter de `BaseAgent`, implémenter les méthodes requises
- Modifier un modèle : Mettre à jour la dataclass et les méthodes de sérialisation
- Débugger un agent : Utiliser les logs détaillés dans `logs/{agent_name}.log`
- Tester un prompt LLM : Utiliser `utils.test_prompt()` helper