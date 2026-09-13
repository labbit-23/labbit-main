# TASK FOR CODEX: Patient password login on lab.sdrc.in

User, 2026-08-28: "The other day a patient logged in using lab.sdrc.in and their
OTP, can you add a password mechanism mimiced from labit.sdrc.in so that patients
can start using passwords... You can ship the first part of labit-main to codex."

This is scoped as the smaller, self-contained "first half" of a two-part ask (the
second half — passkeys for both patients and staff — is separate, bigger, and not
this task; see the timeline the user was given for that half elsewhere).

## Where

Everything lives in **this repo (labit-main)**, self-contained — `lab.sdrc.in` has
its own Supabase database, entirely separate from `labit_core`'s Postgres. No
cross-repo work needed.

- Patient OTP login (existing, working): `app/api/send-otp/route.js` +
  `app/api/verify-otp/route.js`. Looks up `patients` (columns confirmed: id, name,
  email, mrn — **no password column today**) by phone.
- Staff/executive login (existing, working, the pattern to mimic):
  `app/api/auth/user-login/route.js` — verifies a password via
  `bcryptjs.compare()` against `executives.password_hash` (bcrypt, not argon2id),
  keyed by phone/email. `send-otp`/`verify-otp` already branch to executives for
  OTP-based password RESET too (`purpose=employee_reset`, `forcePatientLogin`,
  `isExecutive` flags) — that reset flow is the direct template for patients'
  first-time password setup.
- Session: `lib/session.js`, IronSession, cookie `labbit_session`. Patient session
  today is `session.user = {phone, userType:"patient", patients:[...]}` — a
  password-based login should populate the exact same session shape so nothing
  downstream needs to change.

## What to build

1. **Schema**: add `password_hash` (text, nullable — most existing patients won't
   have one yet) to the `patients` table in lab.sdrc.in's own Supabase DB. Nullable
   is deliberate: a patient with no password_hash set has never enabled password
   login and MUST still be able to use OTP as before (password is additive, not a
   replacement — OTP login must keep working unchanged for every patient
   regardless of whether they ever set a password).
2. **First-time password setup**: OTP-gated, mirroring the executive
   `employee_reset` flow already in `verify-otp/route.js` — a patient verifies via
   OTP once, then is offered a "set a password" step. Do not let a patient set a
   password without first proving phone ownership via OTP (this is the only
   identity check in this system; don't skip it).
3. **Password login route**: a patient branch in `app/api/auth/user-login/route.js`
   (or a clean new route calling the same `bcryptjs.compare()` pattern) — same
   verification approach as executives, but against `patients.password_hash`, and
   producing the same `session.user = {phone, userType:"patient", ...}` shape
   `verify-otp` already produces so every existing downstream page keeps working
   unchanged.
4. **UI**: a password field option on the patient login screen alongside the
   existing OTP flow (both stay available — this is additive), plus the
   OTP-gated "set/change password" screen from step 2.
5. **Rate limiting / lockout**: the executive password path doesn't appear to have
   explicit lockout per the investigation that scoped this task — check whether
   one exists before assuming it does, and if not, this is a good moment to add a
   simple attempt-count lockout for the new patient path (bcrypt alone doesn't
   rate-limit; labit-core's own `password_service.py` has a 5-attempts/15-min
   lockout pattern worth mirroring in spirit, even though it's a different
   stack/DB).

## Explicitly NOT in this task

- Passkeys (patient or staff) — separate, bigger, later.
- Anything in labit-core or labit-ui — this whole task is self-contained in
  labit-main's own DB and routes.
- Migrating `patients`/`executives` to `labit_core.patient`/`app_user` — out of
  scope, these remain the two separate identity systems they are today.

## Git policy reminder (this repo specifically)

Per labit-core/CLAUDE.md's documented policy for labit-main: this is "the ONE
careful repo — OTHER DEVELOPERS SHARE IT." Branch first
(`feature/patient-password-login` or similar) → PR, never straight to `main`.
Stage only the files this task actually touches.
