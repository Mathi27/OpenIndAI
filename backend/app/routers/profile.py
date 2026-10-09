from __future__ import annotations

import sqlite3
import time

from fastapi import APIRouter, Depends

from .. import db
from ..config import Settings
from ..content import load_catalogue
from ..deps import CurrentUser, current_user, get_conn, get_settings_dep, require_client_header
from ..errors import APIError
from ..schemas import MeOut, ProfileOut, ProfileUpdate, UserOut

router = APIRouter(prefix="/api/profile", tags=["profile"], dependencies=[Depends(require_client_header)])


def load_me(conn: sqlite3.Connection, user_id: int) -> MeOut:
    u = conn.execute("SELECT id, username, role, display_name, is_dev_account FROM users WHERE id = ?", (user_id,)).fetchone()
    p = conn.execute("SELECT industry, designation, experience, pathway, language FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    profile = ProfileOut(
        industry=p["industry"], designation=p["designation"], experience=p["experience"],
        pathway=p["pathway"], language=p["language"],
        complete=bool(p["industry"] and p["designation"] and p["experience"]),
    )
    return MeOut(
        user=UserOut(id=u["id"], username=u["username"], role=u["role"], displayName=u["display_name"], isDevAccount=bool(u["is_dev_account"])),
        profile=profile,
    )


@router.get("", response_model=MeOut)
def get_profile(user: CurrentUser = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)) -> MeOut:
    return load_me(conn, user.id)


@router.put("", response_model=MeOut)
def update_profile(body: ProfileUpdate, user: CurrentUser = Depends(current_user),
                   conn: sqlite3.Connection = Depends(get_conn), settings: Settings = Depends(get_settings_dep)) -> MeOut:
    catalogue = load_catalogue(settings.shared_dir)
    current = conn.execute("SELECT industry, designation FROM profiles WHERE user_id = ?", (user.id,)).fetchone()
    fields = body.model_dump(exclude_unset=True)

    industry = fields.get("industry", current["industry"])
    designation = fields.get("designation", current["designation"])
    if "industry" in fields and fields["industry"] is not None and catalogue.industry(fields["industry"]) is None:
        raise APIError(422, "UNKNOWN_INDUSTRY", "The selected industry does not exist.")
    # Changing industry resets a designation that does not belong to the new industry.
    if "industry" in fields and "designation" not in fields and designation and industry:
        if catalogue.designation(industry, designation) is None:
            designation = None
            fields["designation"] = None
    if "designation" in fields and fields["designation"] is not None:
        if not industry:
            raise APIError(422, "INDUSTRY_REQUIRED", "Select an industry before choosing a designation.")
        if catalogue.designation(industry, fields["designation"]) is None:
            raise APIError(422, "INVALID_DESIGNATION", "That designation is not available for the selected industry.")

    with db.transaction(conn):
        if "displayName" in fields and fields["displayName"]:
            conn.execute("UPDATE users SET display_name = ? WHERE id = ?", (fields.pop("displayName"), user.id))
        fields.pop("displayName", None)
        column = {"industry": "industry", "designation": "designation", "experience": "experience", "pathway": "pathway", "language": "language"}
        for key, value in fields.items():
            if key in ("pathway", "language") and value is None:
                continue
            conn.execute(f"UPDATE profiles SET {column[key]} = ? WHERE user_id = ?", (value, user.id))
        conn.execute("UPDATE profiles SET updated_at = ? WHERE user_id = ?", (time.time(), user.id))
    return load_me(conn, user.id)
