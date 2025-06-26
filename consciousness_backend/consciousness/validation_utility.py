import json
import sys
from jsonschema import validate, ValidationError
from pathlib import Path

def validate_user_profile(profile_path: str, schema_path: str):
    with open(profile_path) as f:
        profile_data = json.load(f)
    with open(schema_path) as f:
        schema = json.load(f)

    try:
        validate(instance=profile_data, schema=schema)
        print(f"✅ {profile_path} is valid.")
    except ValidationError as e:
        print(f"❌ Validation error in {profile_path}: {e.message}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python validation_utility.py <user_profile.json> <schema.json>")
        sys.exit(1)
    validate_user_profile(sys.argv[1], sys.argv[2])