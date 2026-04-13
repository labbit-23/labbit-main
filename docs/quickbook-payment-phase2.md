# Quickbook Payments Phase 2 Notes

## Objective
Add payment tracking to Booking Requests now, while keeping design compatible with future online payment events.

## Scope
- Tag payment status on booking requests.
- Track offline/manual collections (QR, payment link, cash at center).
- Keep room for gateway callback integration later.

## Proposed Data Model (Phase 2)
Use `quickbookings` as the source row and add payment snapshot fields:
- `payment_status` text
- `payment_mode` text
- `payment_amount` numeric
- `payment_ref` text
- `payment_link` text
- `payment_paid_at` timestamptz
- `payment_notes` text
- `payment_meta` jsonb

Optional audit table for multiple attempts/events:
- `quickbooking_payments` (new table)
  - `id` uuid pk
  - `quickbooking_id` uuid fk
  - `event_type` text
  - `status` text
  - `amount` numeric
  - `mode` text
  - `provider_ref` text
  - `payload` jsonb
  - `created_at` timestamptz default now()
  - `created_by` uuid null

## Requisition Linking Requirement
For online payment reconciliation and billing alignment, booking request should eventually carry a Shivam requisition reference once available.

Proposed fields on `quickbookings`:
- `shivam_requisition_no` text
- `shivam_requisition_id` text (if separate id exists)

## Workflow Recommendation
1. Agent marks request `IN_PROGRESS`.
2. Agent tags payment step (`LINK_SENT`, `PAID`, `FAILED`, `WAIVED`, etc.).
3. On center-visit completion, agent sets final payment outcome and closes request.
4. Later, online gateway webhooks can upsert into payment fields/audit table.

## Notes
- Do not block request processing if payment is not yet tagged.
- Keep all payment updates editable with audit trail.
- Use this same flow for home and center bookings where applicable.
