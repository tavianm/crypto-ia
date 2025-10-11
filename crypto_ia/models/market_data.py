from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List

@dataclass
class MarketData:
    symbol: str
    timestamp: datetime
    price: float
    volume: float
    orderbook: Dict[str, List[float]]
    source: str
    
    def to_dict(self) -> dict:
        return {
            'symbol': self.symbol,
            'timestamp': self.timestamp.isoformat(),
            'price': self.price,
            'volume': self.volume,
            'orderbook': self.orderbook,
            'source': self.source
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'MarketData':
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)
