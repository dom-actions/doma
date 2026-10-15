"""Shared local authentication for the DomA MCP stdio client and daemon."""

from __future__ import annotations

import os
import re
import secrets
import stat
import time
from pathlib import Path


_TOKEN_RE = re.compile(r"[0-9a-f]{64}\Z")


def _token_path() -> Path:
    configured = os.environ.get("DOMA_BRIDGE_TOKEN_FILE")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".doma" / "mcp" / "bridge-auth-token"


def load_or_create_token() -> str:
    """Return one per-user token shared by all local MCP client processes."""
    path = _token_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        try:
            with os.fdopen(fd, "w", encoding="ascii") as token_file:
                token_file.write(secrets.token_hex(32) + "\n")
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    # Another client may have created the file but not finished writing it yet.
    for attempt in range(20):
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise RuntimeError(f"DomA bridge token is not a regular file: {path}")
        if os.name != "nt":
            if info.st_uid != os.getuid():
                raise RuntimeError(f"DomA bridge token has a different owner: {path}")
            if stat.S_IMODE(info.st_mode) & 0o077:
                raise RuntimeError(f"DomA bridge token must be readable only by its owner: {path}")
        token = path.read_text(encoding="ascii").strip()
        if _TOKEN_RE.fullmatch(token):
            return token
        if token or attempt == 19:
            raise RuntimeError(f"DomA bridge token is invalid: {path}")
        time.sleep(0.05)
    raise RuntimeError(f"DomA bridge token is unavailable: {path}")
