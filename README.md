# Crypto-IA

Système de trading crypto intelligent utilisant des agents IA locaux et FreqTrade

## Description

Ce projet implémente un système de trading cryptocurrency modulaire basé sur des agents IA locaux. Il utilise Ollama pour l'exécution locale des modèles d'IA et s'intègre avec FreqTrade pour l'exécution des trades.

## Architecture

Le système est composé de plusieurs agents spécialisés :

- MarketDataAgent : Collecte et normalisation des données de marché
- SentimentAnalysisAgent : Analyse du sentiment des news et réseaux sociaux
- TechnicalAnalysisAgent : Analyse technique et détection de patterns
- RiskManagementAgent : Gestion du risque et du capital
- ExecutionAgent : Exécution des ordres via FreqTrade

## Prérequis

- Python 3.11+
- Ollama
- FreqTrade
- Redis (optionnel)

## Installation

```bash
# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/MacOS
venv\Scripts\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt

# Installer Ollama
curl https://ollama.ai/install.sh | sh

# Télécharger les modèles nécessaires
ollama pull phi:mini
ollama pull llama2:3
ollama pull mistral:7b
```

## Configuration

Copiez le fichier `config.example.yml` vers `config.yml` et ajustez les paramètres selon vos besoins.

## Utilisation

```bash
# Lancer le système
python main.py
```

## Développement

```bash
# Installer les dépendances de développement
pip install -r requirements-dev.txt

# Lancer les tests
pytest

# Vérifier le style du code
flake8
```

## Licence

MIT

## Contributeurs

- [Votre nom]