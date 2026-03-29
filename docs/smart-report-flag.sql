-- Enable Smart Report menu + API usage for a lab (whatsapp_outbound config)
-- Replace <LAB_UUID> with actual labs.id value.

update public.labs_apis
set templates = jsonb_set(
  coalesce(templates, '{}'::jsonb),
  '{smart_report_enabled}',
  'true'::jsonb,
  true
)
where lab_id = '<LAB_UUID>'
  and api_name = 'whatsapp_outbound';

-- Optional: set Smart Report logo URL used in generated report header.
update public.labs_apis
set templates = jsonb_set(
  coalesce(templates, '{}'::jsonb),
  '{smart_report_logo_url}',
  to_jsonb('https://your-cdn.example.com/sdrc-logo.png'::text),
  true
)
where lab_id = '<LAB_UUID>'
  and api_name = 'whatsapp_outbound';

-- Disable Smart Report quickly.
update public.labs_apis
set templates = jsonb_set(
  coalesce(templates, '{}'::jsonb),
  '{smart_report_enabled}',
  'false'::jsonb,
  true
)
where lab_id = '<LAB_UUID>'
  and api_name = 'whatsapp_outbound';

