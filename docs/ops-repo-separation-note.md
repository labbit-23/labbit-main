# Ops Repo Separation Note

`labbit-main` should remain the Next.js app repo.

CTO collector + digest ops artifacts were moved out to sibling repo workspace:

- `../labbit-ops/cto-collector/collector.py`
- `../labbit-ops/cto-collector/run_digest.sh`
- `../labbit-ops/sql/cto-digest-backfill.sql`

Runtime control is PM2-first (no systemd dependency required).

Existing monitoring already present in `labbit-py` is unchanged.
