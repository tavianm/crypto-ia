import json
from typing import Dict, List, Optional, Union
from datetime import datetime, timedelta
import ccxt.async_support as ccxt
import redis.asyncio as redis
import aiohttp
from loguru import logger

from .base import BaseAgent
from ..models.market_data import MarketData, OHLCV

class MarketDataAgent(BaseAgent):
    """
    Agent responsable de la collecte et du traitement des données de marché.
    Utilise CCXT pour interagir avec les exchanges et Redis pour le cache.
    """

    def __init__(self, config: Dict):
        """
        Initialise le MarketDataAgent.

        Required config:
            exchange_id: str - Identifiant de l'exchange (ex: 'binance')
            symbols: List[str] - Liste des paires de trading
            timeframes: List[str] - Liste des timeframes à surveiller
        
        Optional config:
            redis_url: str - URL de connexion Redis
            cache_duration: int - Durée de validité du cache en secondes
            api_key: str - Clé API de l'exchange
            api_secret: str - Secret API de l'exchange
        """
        super().__init__(config)
        self.exchange_id = config['exchange_id']
        self.symbols = config['symbols']
        self.timeframes = config['timeframes']
        self.cache_duration = config.get('cache_duration', 300)
        
        self.exchange = None
        self.redis = None
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialise les connexions à l'exchange et au cache Redis."""
        logger.info(f"{self.name}: Initialisation...")
        try:
            # Initialisation de l'exchange
            exchange_class = getattr(ccxt, self.exchange_id)
            self.exchange = exchange_class({
                'apiKey': self.config.get('api_key'),
                'secret': self.config.get('api_secret'),
                'enableRateLimit': True,
                'options': {'defaultType': 'spot'}
            })
            
            # Initialisation de Redis si configuré
            if redis_url := self.config.get('redis_url'):
                self.redis = redis.Redis.from_url(redis_url, decode_responses=True)
                # Test de la connexion
                await self.redis.ping()
                logger.info(f"{self.name}: Connexion Redis établie")
            
            await self.exchange.load_markets()
            self._initialized = True
            logger.info(f"{self.name}: Initialisé avec succès")
            
        except Exception as e:
            logger.error(f"{self.name}: Erreur d'initialisation - {str(e)}")
            await self.shutdown()
            raise
    
    async def shutdown(self) -> None:
        """Ferme proprement les connexions."""
        logger.info(f"{self.name}: Arrêt en cours...")
        try:
            if self.exchange:
                await self.exchange.close()
            if self.redis:
                await self.redis.close()
            self._initialized = False
            logger.info(f"{self.name}: Arrêt terminé")
        except Exception as e:
            logger.error(f"{self.name}: Erreur lors de l'arrêt - {str(e)}")
            raise
    
    async def get_market_data(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 100,
        since: Optional[Union[int, datetime]] = None
    ) -> MarketData:
        """
        Récupère les données de marché pour un symbol et timeframe donnés.
        Utilise le cache Redis si disponible.
        """
        if not self._initialized:
            raise RuntimeError(f"{self.name}: Agent non initialisé")
            
        if symbol not in self.symbols:
            raise ValueError(f"{self.name}: Symbol {symbol} non configuré")
        if timeframe not in self.timeframes:
            raise ValueError(f"{self.name}: Timeframe {timeframe} non configuré")
        
        cache_key = f"market_data:{self.exchange_id}:{symbol}:{timeframe}"
        
        # Tentative de récupération depuis le cache
        if self.redis:
            cached_data = await self._get_from_cache(cache_key)
            if cached_data:
                logger.debug(f"{self.name}: Données récupérées du cache pour {symbol}")
                return cached_data
        
        # Récupération depuis l'exchange
        try:
            if isinstance(since, datetime):
                since = int(since.timestamp() * 1000)
                
            raw_data = await self.exchange.fetch_ohlcv(
                symbol=symbol,
                timeframe=timeframe,
                limit=limit,
                since=since
            )
            
            market_data = MarketData(
                symbol=symbol,
                exchange=self.exchange_id,
                timeframe=timeframe,
                last_update=datetime.now(),
                ohlcv=[OHLCV.from_ccxt(candle) for candle in raw_data],
                orderbook={}  # À implémenter plus tard
            )
            
            # Mise en cache
            if self.redis:
                await self._store_in_cache(cache_key, market_data)
            
            return market_data
            
        except Exception as e:
            logger.error(f"{self.name}: Erreur lors de la récupération des données pour {symbol} - {str(e)}")
            raise
    
    async def _get_from_cache(self, key: str) -> Optional[MarketData]:
        """Récupère et valide les données du cache."""
        try:
            data = await self.redis.get(key)
            if not data:
                return None
            
            market_data = MarketData.from_dict(json.loads(data))
            age = (datetime.now() - market_data.last_update).total_seconds()
            
            if age > self.cache_duration:
                await self.redis.delete(key)
                return None
                
            return market_data
            
        except Exception as e:
            logger.warning(f"{self.name}: Erreur de lecture du cache - {str(e)}")
            return None
    
    async def _store_in_cache(self, key: str, data: MarketData) -> None:
        """Stocke les données dans le cache."""
        try:
            await self.redis.setex(
                name=key,
                time=self.cache_duration,
                value=json.dumps(data.to_dict())
            )
        except Exception as e:
            logger.warning(f"{self.name}: Erreur d'écriture dans le cache - {str(e)}")
    
    async def health_check(self) -> bool:
        """Vérifie l'état de santé de l'agent."""
        if not self._initialized:
            return False
            
        try:
            # Vérifie la connexion à l'exchange
            await self.exchange.fetch_status()
            
            # Vérifie Redis si configuré
            if self.redis:
                await self.redis.ping()
                
            return True
            
        except Exception as e:
            logger.error(f"{self.name}: Erreur de health check - {str(e)}")
            return False
