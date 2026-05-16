# Whatsapp API Template Internal

Internal API contract for sending WhatsApp messages **through Labbit** so they are logged against patient phone in `whatsapp_messages` and session metadata in `chat_sessions`.

## Endpoint

- Method: `POST`
- URL: `https://api.sdrc.in/api/internal/whatsapp/send`

## Why use this route

- Centralized outbound sender in Labbit
- Message logging in `whatsapp_messages`
- Session tracking/touch in `chat_sessions`
- Consistent auth and source tagging for all upstream senders

## Auth

Use any one header:

- `Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>`
- `x-ingest-token: <WHATSAPP_INTERNAL_SEND_TOKEN>`
- `x-internal-token: <WHATSAPP_INTERNAL_SEND_TOKEN>`

Token lookup in Labbit:

- `WHATSAPP_INTERNAL_SEND_TOKEN` (primary)
- `WHATSAPP_EXTERNAL_INGEST_TOKEN` (fallback)

## LAB ID behavior

- `lab_id` is optional in payload only if `DEFAULT_LAB_ID` is set in environment.
- Effective logic: `lab_id = body.lab_id || process.env.DEFAULT_LAB_ID`.
- If both missing, API returns `400` (`Missing lab_id or phone`).

## Input Modes

The route auto-detects kind if `message_type/kind/type` not supplied.

### 1) Template mode (template name + params)

Use when sending WhatsApp template body variables.

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "template",
  "template_name": "report_update_template",
  "language_code": "en",
  "template_params": ["Pav", "CBC + LFT"],
  "source_service": "report_sender_worker"
}
```

Accepted aliases:

- `template_name`, `templateName`, `campaign_name`, `campaignName`
- `template_params`, `templateParams`

Default template fallback:

- If template name is absent, Labbit tries `templates.default_campaign` or `default_campaign` from `labs_apis` (`api_name=whatsapp_outbound`).

### 2) File attachment mode (document URL)

Use when sending a file/document to WhatsApp.

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "document",
  "document_url": "https://example.com/reports/REQ123.pdf",
  "filename": "REQ123.pdf",
  "caption": "Please find your report attached.",
  "source_service": "report_sender_worker"
}
```

Accepted URL aliases:

- `document_url`, `media_url`, `url`

### 3) Text mode

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "phone": "919949099249",
  "message_type": "text",
  "text": "Your report is ready.",
  "source_service": "report_sender_worker"
}
```

## Important behavior: Template + attachment in same request

- This endpoint handles one primary mode per request.
- If both template fields and `document_url/media_url/url` are sent, route resolves as **document mode first**.
- For explicit “template with PDF header document”, use:
  - `POST /api/internal/whatsapp/report-template-send` (report-specific flow), or
  - extend this route to accept template header document fields.

## cURL examples

### Template

```bash
curl -X POST "https://api.sdrc.in/api/internal/whatsapp/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>" \
  -d '{
    "phone":"919949099249",
    "message_type":"template",
    "template_name":"report_update_template",
    "template_params":["Pav","CBC + LFT"],
    "source_service":"report_sender_worker"
  }'
```

### File attachment

```bash
curl -X POST "https://api.sdrc.in/api/internal/whatsapp/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <WHATSAPP_INTERNAL_SEND_TOKEN>" \
  -d '{
    "phone":"919949099249",
    "message_type":"document",
    "document_url":"https://example.com/reports/REQ123.pdf",
    "filename":"REQ123.pdf",
    "caption":"Please find your report attached.",
    "source_service":"report_sender_worker"
  }'
```

## Success responses

Template:

```json
{
  "success": true,
  "ok": true,
  "kind": "template",
  "template_name": "report_update_template",
  "provider_message_id": "wamid....",
  "provider_response": {}
}
```

Document:

```json
{
  "success": true,
  "ok": true,
  "kind": "document"
}
```

## Common errors

- `401 Unauthorized`
- `400 Missing lab_id or phone`
- `400 Missing text`
- `400 Missing document_url/media_url/url`
- `400 Missing template_name and no default_campaign found`

## Sender plug-in contract

For upstream systems integrating into Labbit:

- Always pass `phone` and `source_service`.
- Pass `lab_id` unless you intentionally rely on `DEFAULT_LAB_ID`.
- Use template mode for paramized templates.
- Use document mode for file attachments by URL.
- Expect logs/session updates to happen inside Labbit automatically.
