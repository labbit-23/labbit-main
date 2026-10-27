# Marketing control panel: deploy runbook

Scope: WhatsApp marketing panel (`/marketing`), campaign engine v3, bot/tracker/inbox (all OFF by default), and the labit-core audience + health-summary link.
Written 2026-10-28 after the final review. Nothing below has been run against production. Every step says who must approve it.

Approver key: **DIR** = director (Pavan), **DEV** = whoever is deploying, **PATH** = pathologist (Dr Vijay), **OPS** = person with Mtalkz / Meta Business access.

## 0. State of the code at review time

| Repo | Unpushed commits (all local) |
|---|---|
| labit-core | `daa1f28` audience service, `a9213d5` health summary link + `/public/s/<token>`, `66ba4c3` audience engine (filters, funnel, summary, focus areas) |
| labit-main | `98830c5`..`c20c217` (engine, templates, bot, panel) plus the review commits on top (`a7d56cc`, `e41713c`, `63941b4`, `ee10ab3`, docs). Run `git log --oneline origin/main..HEAD` to list them. |

Unrelated local changes in labit-main (`app/api/internal/whatsapp/staff-notify/route.js`, `app/cto/CtoDashboardPage.js`, `app/kiosk/page.js` and untracked files) are NOT part of this release and must not be committed with it.
`deploy-vps-frontend.sh` refuses a dirty tree and pulls `origin/main`, so what is pushed is exactly what ships.

## 1. Before anything: capture rollback points (read-only)  [DEV]

```bash
ssh root@labit.sdrc.in "git -C /opt/labit/labit-core rev-parse HEAD; git -C /opt/labbit-frontend rev-parse HEAD"
ssh root@supabase.sdrc.in "git -C /opt/labit/labit-core rev-parse HEAD"
```
Write the three SHAs down. They are the rollback targets in section 9.

## 2. Pre-flight read-only checks on the database  [DEV, DIR aware]

Via VPS2 (`docker exec supabase-db psql -U postgres`). These are SELECTs only.

```sql
-- migration 20261026 adds a UNIQUE index on (campaign_id, mobile): it fails if duplicates exist. Expect 0 rows.
select campaign_id, mobile, count(*) from public.campaign_recipients group by 1,2 having count(*) > 1 limit 5;
-- the new status checks must accept every existing row. Expect only draft/running/completed and pending/sent/failed.
select status, count(*) from public.campaigns group by 1;
select status, count(*) from public.campaign_recipients group by 1;
-- the permission insert needs these to exist
select count(*) from public.labs;
select count(*) from public.uac_role_permissions where permission = '*';
```
If the duplicate query returns rows, stop and ask DEV to dedupe them first.

## 3. Migrations  [DIR approves; DEV applies]

Order matters: 26, then v3, then bot/tracker (the file names sort the other way for the last two; do NOT use a glob). Each file is idempotent and was dry-run twice, in this order, on a throwaway PostgreSQL 16 with a minimal fixture (labs, `uac_role_permissions`, the V1 campaign tables with a pre-existing "sent" row). It was NOT run against the real production schema.
`20261026` was edited during review so that its status constraint already includes `'scheduled'`; re-running it after v3 no longer narrows the constraint.

```bash
cd /home/sdrc/projects/labit/labit-main
for f in 20261026_marketing_campaigns 20261028_marketing_engine_v3 20261028_marketing_bot_tracker; do
  ssh root@supabase.sdrc.in "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 --single-transaction" < db/migrations/$f.sql || break
done
# make PostgREST (supabase-js) see the new tables and columns
ssh root@supabase.sdrc.in "docker exec -i supabase-db psql -U postgres -c \"NOTIFY pgrst, 'reload schema';\""
```
Verify (read-only):
```sql
select to_regclass('public.marketing_segments'), to_regclass('public.marketing_offers'), to_regclass('public.marketing_audit'),
       to_regclass('public.whatsapp_bot_settings'), to_regclass('public.whatsapp_inbox_threads'), to_regclass('public.whatsapp_opt_outs');
select role_key, count(*) from public.uac_role_permissions where permission like 'marketing.%' group by 1;   -- admin 5, manager 4, executive 2 per lab
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.campaigns'::regclass and contype='c';
```
New tables have RLS enabled with no policies: only the service-role key (the app server) can read them, which is intended.

## 4. labit-core  [DIR approves the push; DEV deploys]

1. Push: `cd /home/sdrc/projects/labit/labit-core && git push origin main` (the untracked `.scratch/` stays untracked).
2. Environment on BOTH VPS1 and VPS2 labit-core processes (wherever the other labit-core env vars live):
   - `CAMPAIGN_AUDIENCE_TOKEN` = a new random 32+ char secret (same value must be set in labit-main, section 5).
   - `BILL_LINK_SECRET` (already used for `/pay` and `/r` links; the summary link reuses it; do not change it or live links break).
   - `LABIT_JASPER_URL` (needed to render the summary PDF; already set for report rendering, confirm).
   - The archive read credentials the existing audience service uses (already needed by `daa1f28`).
3. Deploy VPS1 first, then VPS2 only if VPS1 is clean (labit-core is load-balanced across both):
```bash
ssh root@labit.sdrc.in "bash /opt/labit/labit-core/scripts/deploy_labit_core_pm2.sh"
# check health + private path before touching VPS2
ssh root@labit.sdrc.in "curl -fsS http://10.0.0.2:8001/health; git -C /opt/labit/labit-core log --oneline -1"
ssh root@supabase.sdrc.in "HOST=0.0.0.0 bash /opt/labit/labit-core/scripts/deploy_labit_core_pm2.sh"
ssh root@supabase.sdrc.in "git -C /opt/labit/labit-core log --oneline -1"     # must equal the VPS1 sha
```
Smoke (read-only), from VPS1:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/internal/campaign-audience/summary            # expect 401 (no token)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/public/s/not-a-token                         # expect 404
# token present: aggregates only, masked phones. First call scans the archive (~12 s); a 5-minute in-process cache follows.
curl -s -H "X-Internal-Token: $CAMPAIGN_AUDIENCE_TOKEN" "http://127.0.0.1:8000/internal/campaign-audience/summary?sex=F&max_audience=50" | head -c 600
```
Note: the audience scan is cached per process, so VPS1 and VPS2 each hold their own copy. labit-main calls whichever `LABIT_CORE_BASE_URL`/`LABIT_CORE_API_URL` points to.

## 5. labit-main environment  [DIR provides the values; DEV sets them]

Set where the other `labbit-frontend` variables live on VPS1, then `pm2 restart labbit-frontend --update-env` (the deploy script does this).

| Variable | Value / note |
|---|---|
| `CAMPAIGN_AUDIENCE_TOKEN` | same secret as labit-core |
| `LABIT_CORE_API_URL` (or `LABIT_CORE_BASE_URL`) | labit-core base URL; the audience client uses `/internal/campaign-audience/*` under it |
| `LABIT_CORE_SERVICE_USERNAME`, `LABIT_CORE_SERVICE_PASSWORD` | already used by the website-enquiry bridge; the bot's "book follow-up" needs them. If unset, booking falls back to a human handoff |
| `MARKETING_CONTACT_PHONE` | the lab's contact number, as provided by the director. Has no default: with it unset every dry run fails on purpose |
| `MARKETING_TEST_NUMBERS` | comma list of staff mobiles. The only numbers a test message can go to. Unset = every test is refused |
| `MARKETING_ADMIN_ROLES` | default `director,admin` |
| `MARKETING_ADMIN_USERS` | optional extra user ids/emails |
| `MARKETING_COST_PER_MESSAGE_INR` | default 0.88 is an ASSUMPTION. Set it from the Mtalkz rate card |
| `WHATSAPP_BOT_PHONE_SALT` | long random secret. REQUIRED before enabling the tracker: the built-in default salt is public in the repo, so the "hashed" phone keys could be reversed by brute force. Changing it later orphans the old hashes |
| `WHATSAPP_INTERNAL_SEND_TOKEN` | already set; used by the scheduler (section 7) |
| `DEFAULT_LAB_ID` | already set; the lab all marketing sends use |
| `BILL_LINK_SECRET` | lives on labit-core only (the token is minted there) |

## 6. labit-main deploy  [DIR approves the push; DEV deploys]

```bash
cd /home/sdrc/projects/labit/labit-main && git push origin main     # only the marketing/bot commits; unrelated local edits are uncommitted
ssh root@labit.sdrc.in "bash /opt/labbit-frontend/scripts/deploy-vps-frontend.sh"
```
The script runs `npm ci`, `npm run build` and the health check. `next build` and the full `npm test` (see report) pass locally.

nginx on labit.sdrc.in  [DEV, DIR aware] (cannot be verified from here; check the live config first):
- `/api/admin/marketing/` needs `proxy_read_timeout 180s;`. A single audience call can take up to 150 s on a cold scan; nginx's default is 60 s and would return 504 while the work continues in the background.
- `/api/admin/marketing/uploads` needs `client_max_body_size 6m;` (default 1 MB would reject the 5 MB header images with 413).
- `https://labit.sdrc.in/marketing/trend-header.png` must stay publicly fetchable without a login (Meta downloads the header from it). It is a static file in `public/marketing`.

nginx on app.sdrc.in (the host in the template button)  [DEV]:
- Add `location /s/ { ... proxy_pass <labit-core>/public/s/; ... }` copying the existing `/r/` and `/pay/` blocks exactly. Test: `curl -I https://app.sdrc.in/s/not-a-token` returns 404 (not nginx's own 404 page and not a redirect to login).
- **`/t/` (`https://app.labit.online/t/<token>`, the button of the `health_trend_link` template) is NOT built.** There is no route in labit-core, labit-main or labit-patient. That template stays draft until the route exists (or it is re-pointed at `/s/`, which means a new Meta submission). Also decide the canonical host: docs/code mention both `app.sdrc.in` and `app.labit.online`.

Smoke (read-only):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://labit.sdrc.in/api/health                          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://labit.sdrc.in/api/admin/marketing/templates       # 401 (no session)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://labit.sdrc.in/api/internal/whatsapp/marketing-campaign -d '{}'   # 401 (no token)
```
Then as director in a browser: open `/marketing` -> Audience -> Preview (read-only, sends nothing). Check the funnel, breakdowns and cost render with real numbers.

## 7. Scheduler for scheduled campaigns  [DIR approves]

Nothing calls `run-due` on a timer. Without this, a campaign set to "Schedule" never goes out. Optional: skip it and send manually from the panel instead.
On VPS1, root crontab (the engine only acts inside 09:00-20:00 IST, one batch per due campaign, and the in-flight guard makes overlapping calls harmless):
```
* * * * * flock -n /tmp/mk-due.lock curl -fsS -m 70 -X POST -H "X-Internal-Token: $WHATSAPP_INTERNAL_SEND_TOKEN" -H 'Content-Type: application/json' -d '{"action":"due"}' http://127.0.0.1:3000/api/internal/whatsapp/marketing-campaign >> /var/log/marketing-due.log 2>&1
```
(export the token in the crontab or source it from the env file; do not paste it into shell history.)
Remove the line to stop all scheduled sending instantly. Individual campaigns can also be stopped from the panel.

## 8. Meta / Mtalkz templates  [OPS submits; DIR and PATH approve wording]

Source of truth: `docs/marketing-templates.md` and `lib/marketingCampaigns/templateRegistry.js`. All clinical wording needs PATH sign-off first.
Submit in this order, all at once is fine; do not send any until `approved`:
1. `sdrc_health_trend_link` (UTILITY). **Blocked on the `/t/` route (section 6).** Do not submit until that exists.
2. `sdrc_annual_checkup_reminder` (MARKETING)
3. `sdrc_we_miss_you` (MARKETING)
4. `sdrc_festival_offer_<year>` (MARKETING; fill the `[OFFER]`, date and URL placeholders first)
Existing: `trend_reports` (approved; confirm its category and paste the exact approved body into the registry). `package_results` is registered with the placeholder name `CONFIRM_IN_MTALKZ`; the engine now refuses to send it until the real Mtalkz name is put in the registry.
When a template is approved: set `status: "approved"` and the real name in `templateRegistry.js`, commit, redeploy. (Draft or placeholder templates are refused at create, prepare, test and send.)

## 9. Bot switch-on order (every flag is OFF today)  [DIR approves each step; PATH approves reply texts first]

In `/marketing/bot` (requires `marketing.bot.manage`). Watch `/marketing/tracker` and `pm2 logs labbit-frontend | grep whatsapp-bot` for a day between steps:
1. Set `WHATSAPP_BOT_PHONE_SALT` (section 5). Review every reply text in Bot settings with PATH.
2. `global_enabled` ON with nothing else: no behaviour change (the router returns "not handled" for everything).
3. `tracker_enabled`: records interaction events only.
4. `inbox_enabled` + `human_handoff`: unknown / complaint / medical-question messages go to the staff inbox with a holding reply. Staff must be watching the inbox before this goes on.
5. `report_status`, then `package_enquiry`, then `book_followup`, then `report_resend`, then `campaign_attribution`, then `start_optin`.
Kill switch: the red button on the same page (or `POST /api/admin/marketing/bot/kill-switch`). It takes effect within 20 s on every pm2 process (settings cache). STOP / "Stop promotions" opt-outs are handled before the bot and are not affected by any flag.

## 10. Rollback

| What | How |
|---|---|
| Bot misbehaving | kill switch (above). Fully off: SQL `update public.whatsapp_bot_settings set value = value || '{"global_enabled": false}' where key='flags';` |
| A campaign sending badly | Stop in the panel (or `stop` action). Remove the cron line (section 7) for scheduled ones |
| labit-main | on VPS1 `git -C /opt/labbit-frontend reset --hard <SHA from section 1>` (the deploy script pulls `main`, so it cannot be used to go backwards); then `git checkout <SHA> && npm ci && npm run build && pm2 restart labbit-frontend --update-env`. Afterwards put a revert commit on `main` so the next normal deploy does not re-apply it |
| labit-core | same, per VPS, VPS1 first; the old audience GET endpoint is unchanged so older labit-main builds keep working |
| Migrations | additive only (new tables, new nullable columns, widened constraints). Leave them in place on rollback; nothing reads them once the code is reverted |
| Opt-outs | never delete `whatsapp_opt_outs` rows on rollback |

## 11. First campaign checklist  [DIR approves each gate]

1. All of sections 3-6 done; `MARKETING_TEST_NUMBERS` and `MARKETING_CONTACT_PHONE` set; an approved template with a confirmed name exists.
2. Create a small saved segment (Audience tab), preview it, and read the funnel: archive -> confidential -> recently active -> ... -> opt-out -> cooldown -> duplicate phone. Sanity-check the cost line against the Mtalkz rate card.
3. New campaign: pick the approved template, the segment, optional offer, pilot 100. Leave the limits at the defaults. Header image: upload it and confirm "reachable".
4. Dry run (writes nothing). Read the counts and the anonymised sample.
5. Store recipients (pilot). Send the TEST to staff numbers; open the message on a real phone: wording, image, buttons, link (the `/s/` link must open a PDF for a real patient token; test with a staff MRN).
6. Pilot of 100. Wait for delivery/read/failure codes and quality rating. A campaign pauses itself after 5 consecutive send failures.
7. Review results (Results card): failures by Meta code, opt-outs. Only then "Add remaining audience", type the audience count, and send in batches. Keep the tab open: closing it stops the loop (safe to resume; recipients are claimed atomically). Two people pressing send at once cannot double-send a patient.
8. Hard limits you cannot raise from the panel or API: 500 per run, 5000 per day across ALL campaigns, 120 per minute, 09:00-20:00 IST, pause after 5 consecutive failures, opt-outs, 30-day cooldown.

## 12. NOT built or NOT verified (read this before go-live)

Not built:
- The `/t/` per-patient app link and landing page (`health_trend_link` depends on it).
- The scheduler cron (section 7 is a manual step; deliberately not installed).
- Shared rate limiting across processes: the 120/min pace is per running batch; the in-flight guard makes one batch per campaign, but two different campaigns running at once each pace themselves.
- A/B split testing; multilingual (Telugu/Hindi) bot texts (English only); a per-number test allowlist UI; the old Shivam-based `app/admin/campaigns` tool is dead code (left in place, not deleted).
- The two live templates' exact approved wording (registry bodies for `trend_reports` and `package_results` are reconstructions used for previews only).

Not verified (could only be read, or tested against fakes):
- Anything against real WhatsApp/Mtalkz/Meta, including image-header and dynamic URL-button payloads, template categories and the real per-message price.
- The migrations on the real production schema (verified only on a throwaway PostgreSQL 16 with a minimal fixture).
- nginx settings on both VPS hosts (timeouts, upload size, the `/s/` block).
- The pm2 cluster behaviour of the settings cache (20 s) and of the in-memory audience cache (per process, 5 minutes).
- Focus areas / offer tiers (derived from lab results) have not been reviewed by the pathologist and no current template uses them in the message text. Do not wire them into patient-facing text before PATH signs off, and take a privacy/legal view on inferring health conditions in marketing.
- SSRF check on the header-URL reachability call blocks IP literals and local names but does not resolve DNS; it is staff-only, follows no redirects and reads no body.
