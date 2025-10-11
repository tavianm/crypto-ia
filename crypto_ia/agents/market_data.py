from typing import Dict, List
from datetime import datetime
import aiohttp
from .base import BaseAgent
from ..models import MarketData

class MarketDataAgent(BaseAgent):
    async def initialize(self) -> None:
        self.session = aiohttp.ClientSession()
        self.cache = {}
    
    async def shutdown(self) -> None:
        await self.session.close()
    
    async def get_data(self, symbol: str) -> MarketData:
        """Fetch market data for a symbol"""
        # Vérifier le cache d'abord
        if self._is_cache_valid(symbol):
            return self.cache[symbol]
        
        # Collecter les données de plusieurs sources
        data = await self._fetch_market_data(symbol)
        
        # Mettre à jour le cache
        self.cache[symbol] = data
        self._update_timestamp()
        
        return data
    
    async def _fetch_market_data(self, symbol: str) -> MarketData:
        """Fetch data from configured sources"""
        # Implémentation à venir
        pass
    
    def _is_cache_valid(self, symbol: str) -> bool:
        """Check if cached data is still valid"""
        if symbol not in self.cache:
            return False
        
        cache_duration = self.config.get('cache_duration', 300)  # 5 minutes par défaut
        if not self.last_update:
            return False
            
        age = (datetime.now() - self.last_update).total_seconds()
        return age < cache_duration
