import uuid
import time
import requests
from django.conf import settings

bank = input("Bank (cbe / telebirr / boa): ").strip().lower()
reference = input("Reference: ").strip()
suffix = input("Suffix (press Enter if none): ").strip()

payload = {"bank": bank, "reference": reference}
if suffix:
    payload["suffix"] = suffix

key = settings.VERIFY_ET_API_KEY
r = requests.post(
    "https://verify.et/api/verify",
    params={"waitMs": 20000},
    json=payload,
    headers={"x-api-key": key, "Idempotency-Key": str(uuid.uuid4())},
    timeout=45,
)
body = r.json()
print("POST status:", r.status_code)

if r.status_code == 200:
    print(body)
else:
    rid = body.get("requestId")
    print("queued, request id:", rid)
    result = body
    for _ in range(20):
        time.sleep(3)
        result = requests.get(
            f"https://verify.et/api/verify/{rid}",
            headers={"x-api-key": key},
            timeout=20,
        ).json()
        data = result.get("data") or {}
        print("  processingStatus:", data.get("processingStatus"))
        if data.get("processingStatus") in ("completed", "failed"):
            break
    print(result)