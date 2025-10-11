"""
Test d'importation des bibliothèques principales
"""
import sys
print(f"Python version: {sys.version}")

# Core dependencies
print("\nTesting core dependencies...")
import fastapi
import pydantic
import aiohttp
print("✓ Core dependencies OK")

# Data processing
print("\nTesting data processing libraries...")
import numpy as np
import pandas as pd
import ta
import finta
print("✓ Data processing libraries OK")

# Machine Learning
print("\nTesting ML libraries...")
import torch
import transformers
import sklearn
import lightgbm
print(f"✓ ML libraries OK (PyTorch: {torch.__version__})")

# API et Networking
print("\nTesting API and networking libraries...")
import ccxt
import websockets
print("✓ API and networking libraries OK")

# Monitoring et logging
print("\nTesting monitoring and logging libraries...")
import loguru
import prometheus_client
print("✓ Monitoring and logging libraries OK")

print("\nAll imports successful!")