"""Internal-key auth. The only caller is the labit-main Next route handler on localhost, which has already
verified the executive's iron-session and role (director / director_ceo). Single role: every authorised
caller is 'cto'. Fail closed: unset env or missing/wrong header -> 401."""
import hmac
import os

from fastapi import Depends, HTTPException, Request


def get_db(request: Request):
    return request.app.state.db


def require_panel(request: Request) -> dict:
    expected = os.environ.get("PANEL_INTERNAL_KEY", "")
    got = request.headers.get("x-panel-key", "")
    if not expected or not got or not hmac.compare_digest(got.encode(), expected.encode()):
        raise HTTPException(401, "unauthorized")
    # X-Panel-User is trusted (caller is authenticated); used for logging only.
    return {"role": "cto", "executive": request.headers.get("x-panel-user", "")[:64] or None}
