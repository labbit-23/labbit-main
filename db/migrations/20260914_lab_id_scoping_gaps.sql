-- Tenant-scoping FK gaps, closed while there's still only one real tenant
-- with meaningful data. Director, 2026-09-14: "Right now everything is
-- owned by SDRC [add the missing FKs]." Checked before writing anything --
-- this is NOT quite true: public.labs already has a second row, "Yapral -
-- Physiotherapy" (3589fb98-2cf5-4bd4-8da5-4e8681fd4e2b), with 3 real visits
-- already attached. Backfills below are evidence-based per row, not a
-- blanket "assign everything to SDRC":
--   - executives: 8 of 17 had lab_id NULL. One of those 8 is literally
--     named "Yapral" (type=b2b) -- Yapral's own referrer account, not an
--     SDRC staff member. Backfilled that one to Yapral, the other 7
--     (Bhavna, Dr Vijay, Johny, MOHD ABDUL, Nag Rani, Naveen, Sita Reddy)
--     to SDRC.
--   - visits: 1 of 2712 had lab_id NULL. Its executive_id resolves to
--     "Darshan" (Phlebo), who already has lab_id=SDRC -- backfilled to
--     SDRC.
--   - quickbookings: had NO lab_id column at all (flagged as a known gap
--     in docs/rls-draft.sql's own TODO #2, never fixed). Of 232 rows, 52
--     have a linked visit_id -- every single one resolves to SDRC's
--     lab_id, zero to Yapral. Added the column and backfilled all 232 to
--     SDRC on that evidence (Yapral's 3 visits were created directly, not
--     through the quickbooking/website flow).

BEGIN;

UPDATE public.executives SET lab_id = '3589fb98-2cf5-4bd4-8da5-4e8681fd4e2b'
WHERE id = 'a0098bf0-eb24-4b89-a9dd-71c6d30ee6f3'; -- "Yapral" b2b account

UPDATE public.executives SET lab_id = 'b539c161-1e2b-480b-9526-d4b37bd37b1e'
WHERE lab_id IS NULL; -- remaining 7, all real SDRC staff

UPDATE public.visits SET lab_id = 'b539c161-1e2b-480b-9526-d4b37bd37b1e'
WHERE lab_id IS NULL; -- the 1 row, confirmed via its SDRC-lab_id executive

ALTER TABLE public.quickbookings
    ADD COLUMN IF NOT EXISTS lab_id uuid REFERENCES public.labs(id);

UPDATE public.quickbookings SET lab_id = 'b539c161-1e2b-480b-9526-d4b37bd37b1e'
WHERE lab_id IS NULL;

COMMIT;
