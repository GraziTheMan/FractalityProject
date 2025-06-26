# consciousness_api.py
# FastAPI server exposing consciousness endpoints

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import json
from core.identity.consciousness_user import ConsciousnessUser
from core.field_engines.phase_engine import calculate_resonance_score

app = FastAPI()
DATA_DIR = Path("users")

class ConsciousnessResponse(BaseModel):
    consciousness_id: str
    phase_state: str
    energy_level: float
    resonance_frequency: float
    structures: int
    connections: int

@app.get("/users/{user_id}", response_model=ConsciousnessResponse)
def get_user(user_id: str):
    profile_path = DATA_DIR / f"{user_id}.user.json"
    if not profile_path.exists():
        raise HTTPException(status_code=404, detail="User not found")

    with open(profile_path) as f:
        user = ConsciousnessUser.from_dict(json.load(f))

    return ConsciousnessResponse(
        consciousness_id=user.consciousness_id,
        phase_state=user.phase_state,
        energy_level=user.energy_level,
        resonance_frequency=user.resonance_frequency,
        structures=len(user.contributed_structures),
        connections=len(user.resonance_connections)
    )

@app.get("/resonance")
def compare_resonance(user_a: str, user_b: str):
    path_a = DATA_DIR / f"{user_a}.user.json"
    path_b = DATA_DIR / f"{user_b}.user.json"
    if not path_a.exists() or not path_b.exists():
        raise HTTPException(status_code=404, detail="One or both users not found")

    a = ConsciousnessUser.from_dict(json.load(open(path_a)))
    b = ConsciousnessUser.from_dict(json.load(open(path_b)))
    score = calculate_resonance_score(a, b)

    return {"resonance_score": round(score, 4)}
