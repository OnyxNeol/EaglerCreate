# EaglerCreate

## Browser preview

Run `docker compose -f docker-compose.base44.yml up -d` after placing the
EFI-injected offline client at `eaglercraft-injected.html` (not committed).
The preparation job extracts its inline JavaScript into `.base44/client/` and
checks syntax before nginx serves the game at `/` and `/eaglercraft`.
This avoids preview HTML rewriting corrupting HTML snippets inside the game's
JavaScript string pool; it does not disable browser security protections.
Generated client files are ignored. Re-run the preparation job after replacing
the offline client. Mod and test-harness files are served directly from the
checkout; nginx needs no build for source edits. The test harness is available
at `/test/index.html`.

No secrets or sandbox-flag overrides are required for this serving workaround.
