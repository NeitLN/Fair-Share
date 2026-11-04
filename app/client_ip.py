"""The visitor's address behind Render's proxies, for the per-visitor limits of Quick add and of
login, registration and invite codes (FORWARDED_HOPS, docs/ARCHITECTURE.md §6)."""

import ipaddress

# Requests whose visitor address cannot be read share one limit, rather than each getting its own.
UNRESOLVED = "unresolved"


def pick_client_ip(forwarded: str, peer: str | None, hops: int) -> str:
    """The visitor's address: `hops` entries from the end of X-Forwarded-For.

    Each trusted proxy appends the address it saw, so the last `hops` entries are theirs and the
    one they received from is the visitor. Anything further left was sent by the client and may be
    made up ("1.2.3.4, visitor, edge" on Render still gives the visitor).
    """
    if hops <= 0:
        candidate = peer or ""
    else:
        entries = [entry.strip() for entry in forwarded.split(",")] if forwarded.strip() else []
        if len(entries) < hops:
            return UNRESOLVED
        candidate = entries[-hops]
    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        return UNRESOLVED
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped:  # ::ffff:1.2.3.4 is 1.2.3.4
            return str(address.ipv4_mapped)
        # One home line or phone owns a whole /64 and may switch address inside it on every call.
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)
