from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict

from loguru import logger

class BaseAgent(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.name = self.__class__.__name__
        self.last_update = None
        logger.info(f"Initializing {self.name}")
    
    @abstractmethod
    async def initialize(self) -> None:
        """Initialize any resources needed by the agent"""
        pass
    
    @abstractmethod
    async def shutdown(self) -> None:
        """Cleanup any resources used by the agent"""
        pass
    
    def _update_timestamp(self) -> None:
        """Update the last update timestamp"""
        self.last_update = datetime.now()
    
    async def health_check(self) -> bool:
        """Check if the agent is healthy"""
        return True
