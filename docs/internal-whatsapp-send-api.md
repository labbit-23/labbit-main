# Internal WhatsApp Send API (Mtalkz Replacement)

Use this as a drop-in internal gateway so other services (X-Ray/CT/etc.) call one endpoint, while logging stays consistent in `whatsapp_messages`.

## Endpoint

- `POST /api/internal/whatsapp/send`
- Suggested full URL on your domain:
  - `https://lab.sdrc.in/api/internal/whatsapp/send`

## Auth

Pass one of these headers:

- `x-ingest-token: <WHATSAPP_INTERNAL_SEND_TOKEN>`
- `Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>`

Token source:

- `WHATSAPP_INTERNAL_SEND_TOKEN` (preferred)
- fallback: `WHATSAPP_EXTERNAL_INGEST_TOKEN`

## Request (Backward-Compatible)

This endpoint accepts both the new schema and Mtalkz-style fields.

### Common fields

- `lab_id` (optional if `DEFAULT_LAB_ID` is set)
- `phone` or `destination` or `to`
- `source_service` or `source` (for sender metadata)

### Type inference

If `message_type`/`kind` is not provided:

1. If `document_url` / `media_url` / `url` exists -> `document`
2. Else if `template_name` / `templateName` / `campaignName` or template params exist -> `template`
3. Else -> `text`

### 1) Template send (Mtalkz style supported)

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "destination": "919949099249",
  "campaignName": "home_visit_update",
  "templateParams": ["27 Mar, 9:00 AM", "Technician Rahul", "Fasting not required"],
  "source": "xray-service"
}
```

Also accepted aliases:

- `template_name`, `templateName`, `campaign_name`, `campaignName`
- `template_params`, `templateParams`

### 2) Text send

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "text",
  "text": "Your technician is on the way.",
  "source_service": "home-visit-service"
}
```

### 3) Media URL send (document/image URLs)

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "document",
  "media_url": "https://example.com/report.pdf",
  "filename": "report.pdf",
  "caption": "Please find your report attached.",
  "source_service": "ct-service"
}
```

Aliases for URL:

- `document_url`, `media_url`, `url`

## Response

Success:

```json
{
  "success": true,
  "ok": true,
  "kind": "template",
  "template_name": "home_visit_update"
}
```

Error:

```json
{
  "error": "..."
}
```

## Notes

- Messages are sent through the unified WhatsApp sender and logged to `whatsapp_messages`.
- `chat_sessions.last_message_at` is updated after send.
- Existing working admin/inbox routes are unchanged.
