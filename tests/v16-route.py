import json, os, urllib.request
BASE = os.environ["BASE"]
req = urllib.request.Request(BASE + "/api/color-schema", method="POST")
with urllib.request.urlopen(req) as r:
    print("status", r.status, r.read().decode())
with urllib.request.urlopen(BASE + "/api/notion/calendar/schema") as r:
    print("schema", r.status, r.read().decode()[:120])
