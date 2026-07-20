"""
The Event Bus. Every feature that changes something publishes an event here;
anything that needs to react subscribes. Nothing calls another feature's
functions directly to produce a side effect — that coupling is exactly what
this replaces.

This is a real, in-process pub/sub (not Kafka/Redis) — appropriate for one
user's single-process instance, and documented as such rather than oversold.
Handlers can be sync or async; results are collected and returned so a caller
can report what actually happened (e.g. "3 applications rechecked") instead of
firing blind.
"""
import inspect
from typing import Callable

Handler = Callable[..., object]


class EventBus:
    def __init__(self):
        self._handlers: dict[str, list[Handler]] = {}

    def subscribe(self, event_name: str, handler: Handler):
        self._handlers.setdefault(event_name, []).append(handler)

    async def publish(self, event_name: str, **kwargs) -> list:
        results = []
        for handler in self._handlers.get(event_name, []):
            result = handler(**kwargs)
            if inspect.isawaitable(result):
                result = await result
            results.append(result)
        return results


event_bus = EventBus()
