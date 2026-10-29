import os


def _f(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


def stale_seconds() -> float:
    return _f("STALE_SECONDS", 180)


def poll_interval() -> float:
    return _f("POLL_INTERVAL", 60)


def heartbeat_enabled() -> bool:
    return os.environ.get("HEARTBEAT_ENABLED", "0") == "1"


def snapshot_ttl() -> float:
    return _f("SNAPSHOT_TTL", 5)
