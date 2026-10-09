from __future__ import annotations

from .conftest import login


def test_public_catalogue(client):
    r = client.get("/api/catalogue")
    assert r.status_code == 200 and len(r.json()["industries"]) == 3


def test_designations_per_industry(client):
    r = client.get("/api/industries/construction/designations")
    assert [d["id"] for d in r.json()][:2] == ["cn_site_tech", "cn_scaffolding"]
    assert client.get("/api/industries/nope/designations").status_code == 404


def test_invalid_industry_designation_combo(trainee):
    r = trainee.put("/api/profile", json={"designation": "cn_welding"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_DESIGNATION"


def test_industry_change_resets_incompatible_designation(trainee):
    r = trainee.put("/api/profile", json={"industry": "construction"})
    assert r.status_code == 200
    p = r.json()["profile"]
    assert p["industry"] == "construction" and p["designation"] is None and p["complete"] is False


def test_missions_require_complete_profile(client):
    login(client, "trainee.new")
    r = client.get("/api/missions")
    assert r.status_code == 409 and r.json()["error"]["code"] == "PROFILE_INCOMPLETE"


def test_mission_grid_states(trainee):
    grid = trainee.get("/api/missions").json()["categories"]
    hazrec = next(c for c in grid if c["category"] == "og_hazard_recognition")
    assert hazrec["levels"][0]["status"] == "available"
    assert [lv["status"] for lv in hazrec["levels"][1:]] == ["upcoming"] * 4
    others = [c for c in grid if c["category"] != "og_hazard_recognition"]
    assert all(lv["status"] == "upcoming" for c in others for lv in c["levels"])


def test_other_designation_cannot_see_silent_pump(trainee):
    trainee.put("/api/profile", json={"designation": "og_elec_maint"})
    grid = trainee.get("/api/missions").json()["categories"]
    hazrec = next(c for c in grid if c["category"] == "og_hazard_recognition")
    assert hazrec["levels"][0]["status"] == "upcoming"
    r = trainee.post("/api/sessions", json={"missionId": "og-hazrec-l1-silent-pump"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "MISSION_LOCKED"


def test_language_persisted(trainee):
    trainee.put("/api/profile", json={"language": "ta"})
    assert trainee.get("/api/profile").json()["profile"]["language"] == "ta"
    assert trainee.put("/api/profile", json={"language": "fr"}).status_code == 422
