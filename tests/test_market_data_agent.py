"""
Tests unitaires pour MarketDataAgent
"""
import pytest
from datetime import datetime, timedelta
import json
from unittest.mock import AsyncMock, MagicMock, patch

from crypto_ia.agents.market_data import MarketDataAgent
from crypto_ia.models.market_data import MarketData, OHLCV

# Configuration de test
TEST_CONFIG = {
    'exchange_id': 'binance',
    'symbols': ['BTC/USDT', 'ETH/USDT'],
    'timeframes': ['1m', '5m', '1h'],
    'redis_url': 'redis://localhost:6379',
    'cache_duration': 300
}

# Données OHLCV de test
TEST_OHLCV_DATA = [
    [1633042800000, 45000.0, 45100.0, 44900.0, 45050.0, 100.0],  # [timestamp, open, high, low, close, volume]
    [1633042860000, 45050.0, 45200.0, 45000.0, 45150.0, 150.0],
]

@pytest.fixture
async def agent():
    """Fixture pour créer un agent de test avec des mocks"""
    with patch('ccxt.async_support.binance') as mock_exchange:
        # Configuration du mock de l'exchange
        instance = mock_exchange.return_value
        instance.load_markets = AsyncMock()
        instance.fetch_ohlcv = AsyncMock(return_value=TEST_OHLCV_DATA)
        instance.fetch_status = AsyncMock()
        
        agent = MarketDataAgent(TEST_CONFIG)
        await agent.initialize()
        yield agent
        await agent.shutdown()

@pytest.fixture
async def redis_mock():
    """Fixture pour mocker Redis"""
    with patch('redis.asyncio.Redis') as mock_redis:
        instance = mock_redis.return_value
        instance.ping = AsyncMock()
        instance.get = AsyncMock()
        instance.setex = AsyncMock()
        instance.delete = AsyncMock()
        yield instance

@pytest.mark.asyncio
async def test_initialization(agent):
    """Test l'initialisation de l'agent"""
    assert agent._initialized
    assert agent.exchange_id == TEST_CONFIG['exchange_id']
    assert agent.symbols == TEST_CONFIG['symbols']
    assert agent.timeframes == TEST_CONFIG['timeframes']

@pytest.mark.asyncio
async def test_get_market_data(agent):
    """Test la récupération des données de marché"""
    symbol = 'BTC/USDT'
    timeframe = '1m'
    
    market_data = await agent.get_market_data(symbol, timeframe)
    
    assert isinstance(market_data, MarketData)
    assert market_data.symbol == symbol
    assert market_data.exchange == TEST_CONFIG['exchange_id']
    assert market_data.timeframe == timeframe
    assert len(market_data.ohlcv) == len(TEST_OHLCV_DATA)
    
    # Vérifie la conversion des données OHLCV
    first_candle = market_data.ohlcv[0]
    test_data = TEST_OHLCV_DATA[0]
    assert isinstance(first_candle, OHLCV)
    assert first_candle.timestamp == datetime.fromtimestamp(test_data[0] / 1000)
    assert first_candle.open == test_data[1]
    assert first_candle.high == test_data[2]
    assert first_candle.low == test_data[3]
    assert first_candle.close == test_data[4]
    assert first_candle.volume == test_data[5]

@pytest.mark.asyncio
async def test_invalid_symbol(agent):
    """Test la gestion des symboles invalides"""
    with pytest.raises(ValueError):
        await agent.get_market_data('INVALID/PAIR', '1m')

@pytest.mark.asyncio
async def test_invalid_timeframe(agent):
    """Test la gestion des timeframes invalides"""
    with pytest.raises(ValueError):
        await agent.get_market_data('BTC/USDT', 'invalid')

@pytest.mark.asyncio
async def test_redis_cache(agent, redis_mock):
    """Test le système de cache Redis"""
    symbol = 'BTC/USDT'
    timeframe = '1m'
    cache_key = f"market_data:{agent.exchange_id}:{symbol}:{timeframe}"
    
    # Premier appel - pas de cache
    redis_mock.get.return_value = None
    market_data = await agent.get_market_data(symbol, timeframe)
    
    # Vérifie que les données ont été mises en cache
    redis_mock.setex.assert_called_once()
    cache_call = redis_mock.setex.call_args
    assert cache_call[1]['name'] == cache_key
    assert cache_call[1]['time'] == TEST_CONFIG['cache_duration']
    
    # Simule des données en cache
    cached_data = market_data.to_dict()
    redis_mock.get.return_value = json.dumps(cached_data)
    
    # Deuxième appel - devrait utiliser le cache
    cached_market_data = await agent.get_market_data(symbol, timeframe)
    assert cached_market_data.symbol == market_data.symbol
    assert len(cached_market_data.ohlcv) == len(market_data.ohlcv)

@pytest.mark.asyncio
async def test_health_check(agent):
    """Test la vérification de l'état de santé"""
    assert await agent.health_check()
    
    # Simule une erreur de connexion
    agent.exchange.fetch_status = AsyncMock(side_effect=Exception("Connection error"))
    assert not await agent.health_check()