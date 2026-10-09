"""Password hashing (PBKDF2-HMAC-SHA256, stdlib) and opaque session tokens."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

_ALGO = "pbkdf2_sha256"


def hash_password(password: str, iterations: int) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{_ALGO}${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, iterations_s, salt_b64, digest_b64 = encoded.split("$")
        if algo != _ALGO:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations_s))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# Used to equalise timing when the username does not exist.
_DUMMY_HASH: dict[int, str] = {}


def dummy_verify(password: str, iterations: int) -> None:
    if iterations not in _DUMMY_HASH:
        _DUMMY_HASH[iterations] = hash_password("dummy-password", iterations)
    verify_password(password, _DUMMY_HASH[iterations])


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
