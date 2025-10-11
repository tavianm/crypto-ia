from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List

@dataclass
class OHLCV:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    
    def to_dict(self) -> dict:
        return {
            'timestamp': self.timestamp.isoformat(),
            'open': self.open,
            'high': self.high,
            'low': self.low,
            'close': self.close,
            'volume': self.volume
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'OHLCV':
        if isinstance(data['timestamp'], str):
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)
    
    @classmethod
    def from_ccxt(cls, data: List) -> 'OHLCV':
        """Crée une instance OHLCV à partir des données CCXT"""
        return cls(
            timestamp=datetime.fromtimestamp(data[0] / 1000),
            open=float(data[1]),
            high=float(data[2]),
            low=float(data[3]),
            close=float(data[4]),
            volume=float(data[5])
        )

@dataclass
class MarketData:
    symbol: str
    exchange: str
    timeframe: str
    last_update: datetime
    ohlcv: List[OHLCV]
    orderbook: Dict[str, List[float]]  # Optionnel pour l'instant
    
    def to_dict(self) -> dict:
        return {
            'symbol': self.symbol,
            'exchange': self.exchange,
            'timeframe': self.timeframe,
            'last_update': self.last_update.isoformat(),
            'ohlcv': [candle.to_dict() for candle in self.ohlcv],
            'orderbook': self.orderbook
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'MarketData':
        if isinstance(data['last_update'], str):
            data['last_update'] = datetime.fromisoformat(data['last_update'])
        data['ohlcv'] = [OHLCV.from_dict(candle) for candle in data['ohlcv']]
        return cls(**data)
    
    def get_latest_price(self) -> float:
        """Retourne le dernier prix de clôture disponible"""
        if not self.ohlcv:
            raise ValueError(f"Pas de données OHLCV disponibles pour {self.symbol}")
        return self.ohlcv[-1].close
