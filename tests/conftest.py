"""
Configuration des tests pour le projet crypto-ia
"""
import pytest
import asyncio
from pathlib import Path
import sys

# Ajoute le répertoire racine au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configuration de pytest pour les tests asynchrones
@pytest.fixture(scope="session")
def event_loop():
    """Crée une nouvelle boucle événementielle pour chaque session de test."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()