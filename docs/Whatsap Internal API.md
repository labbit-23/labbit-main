# Whatsap Internal API

Use this file for copy-paste integration details.

Primary reference:

- [Internal WhatsApp Send API (Mtalkz Replacement)](/Users/pav/projects/Labbit/labbit-main/docs/internal-whatsapp-send-api.md)

## Endpoint

- `POST /api/internal/whatsapp/send`
- Example: `https://lab.sdrc.in/api/internal/whatsapp/send`

## Auth

Use one:

- `Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>`
- `x-ingest-token: <WHATSAPP_INTERNAL_SEND_TOKEN>`
- `x-internal-token: <WHATSAPP_INTERNAL_SEND_TOKEN>`

## Required Fields

- `lab_id` (optional only if server has `DEFAULT_LAB_ID`)
- `phone` (or `destination` / `to`)

## Quick Booking Template Payload (`website_booking`)

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "template",
  "template_name": "website_booking",
  "language_code": "en",
  "template_params": [
    "Name: Pav\nPhone: 919949099249\nDate: 08-04-2026\nTime: 09:00-09:30 AM\nArea: Test, Test\nPackage: Home Collection"
  ],
  "source_service": "website_quickbook"
}
```

Notes:

- Use template **name** (`website_booking`), not numeric id.
- This template has one body variable (`{{1}}`), so send exactly one param string.

## Curl

```bash
curl -X POST "https://lab.sdrc.in/api/internal/whatsapp/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>" \
  -d '{
    "lab_id":"b539c161-1e2b-480b-9526-d4b37bd37b1e",
    "phone":"919949099249",
    "message_type":"template",
    "template_name":"website_booking",
    "language_code":"en",
    "template_params":["Name: Pav\nPhone: 919949099249\nDate: 08-04-2026\nTime: 09:00-09:30 AM\nArea: Test, Test\nPackage: Home Collection"],
    "source_service":"website_quickbook"
  }'
```

