# Mirth Report Delivery Phase 1

## Goal

Python stages a NeoSoft lab report PDF on local disk, calls a Mirth HTTP endpoint with metadata, Mirth uploads the PDF to FTP using a UUID filename, sends the approved WhatsApp template with the public link, and returns delivery details to Python. Python then persists the final delivery result back into NeoSoft using the APIs it already has.

This phase does not include QR stamping of PDFs.

## High-Level Flow

1. Python determines a requisition is eligible for delivery.
2. Python downloads the PDF from NeoSoft.
3. Python writes the PDF to a staged local path.
4. Python chooses the destination phone:
   - `default_phone` if configured
   - otherwise the actual patient phone
   - otherwise `fallback_phone`
5. Python calls Mirth over HTTP with the staged file path and metadata.
6. Mirth validates the request and confirms the staged file exists.
7. Mirth generates a UUID filename and uploads the PDF to the appropriate FTP folder.
8. Mirth constructs the public URL.
9. Mirth sends the approved WhatsApp template using the public link.
10. Mirth returns a structured JSON response to Python.
11. Python saves success or failure to NeoSoft delivery status APIs.

## Why HTTP Listener

HTTP Listener is the right fit because:

- Python is already a web/API process.
- Python needs a synchronous success or failure response.
- The payload is metadata plus a staged local file path, not a streaming transport problem.
- Debugging with `curl` and logs is straightforward.

File Reader alone is not enough because Python needs a direct response containing delivery metadata such as public URL, WhatsApp message ID, and failure details.

## Python -> Mirth Request

Suggested endpoint:

- `POST /report-delivery/send`

Suggested JSON payload:

```json
{
  "reqno": "20260315001",
  "reqid": "P1600422",
  "phone": "919949099249",
  "local_file_path": "/var/tmp/lab-reports/550e8400-e29b-41d4-a716-446655440000_P1600422.pdf",
  "staged_filename": "550e8400-e29b-41d4-a716-446655440000_P1600422.pdf",
  "template_name": "reports_pdf",
  "report_status": "FULL_REPORT",
  "delivery_source": "PYTHON",
  "requested_at": "2026-03-16T14:30:00+05:30"
}
```

### Required fields

- `reqno`
- `reqid`
- `phone`
- `local_file_path`
- `template_name`
- `report_status`
- `delivery_source`
- `requested_at`

### Optional fields

- `staged_filename`

`local_file_path` should always be an absolute path so Mirth does not need to infer the base staging directory during Phase 1.

## Mirth -> Python Response

Success response:

```json
{
  "success": true,
  "reqno": "20260315001",
  "reqid": "P1600422",
  "sent_to": "919949099249",
  "template_name": "reports_pdf",
  "report_status": "FULL_REPORT",
  "delivery_source": "PYTHON",
  "source_file_path": "/var/tmp/lab-reports/550e8400-e29b-41d4-a716-446655440000_P1600422.pdf",
  "ftp_folder": "reports/2026/03/16",
  "ftp_filename": "ec5a7f74-7d7a-4ce0-b430-532150aa5e63.pdf",
  "public_url": "https://public.example.com/reports/2026/03/16/ec5a7f74-7d7a-4ce0-b430-532150aa5e63.pdf",
  "message_id": "wamid.xxx",
  "sent_at": "2026-03-16T14:30:08+05:30",
  "error": null
}
```

Failure response:

```json
{
  "success": false,
  "reqno": "20260315001",
  "reqid": "P1600422",
  "delivery_source": "PYTHON",
  "source_file_path": "/var/tmp/lab-reports/550e8400-e29b-41d4-a716-446655440000_P1600422.pdf",
  "error": "FTP upload failed"
}
```

## Mirth Channel Outline

### Source Connector

- Type: `HTTP Listener`
- Method: `POST`
- Data Type: `JSON`
- Response Data Type: `JSON`

### Destination / Transformer Steps

1. Parse request JSON.
2. Validate required fields.
3. Confirm `local_file_path` exists and looks like a PDF.
4. Generate UUID filename, keeping `.pdf` extension.
5. Decide FTP folder path.
6. Upload local file to FTP.
7. Construct public URL using configured public base URL.
8. Send WhatsApp template using the configured provider endpoint and API key.
9. Build JSON response with delivery metadata.
10. Return JSON response to Python.

## Reusable Logic from Existing ECG Mirth Channel

The existing ECG channel already demonstrates:

- local file handling
- FTP upload
- public URL creation
- WhatsApp template send with a public document link
- cleanup after successful send

For the report-delivery channel, reuse the same patterns, but trigger them from HTTP input instead of email polling.

## UUID Filename Strategy

Public filenames should not expose requisition numbers or patient identifiers.

Recommended public filename format:

- `<uuid>.pdf`

Example:

- `ec5a7f74-7d7a-4ce0-b430-532150aa5e63.pdf`

The mapping between:

- `reqno`
- `reqid`
- `source_file_path`
- `ftp_filename`
- `public_url`

should be returned to Python and logged there.

## Python Logging / Persistence

Python should retain or persist:

- `reqno`
- `reqid`
- `phone`
- `source_file_path`
- `ftp_filename`
- `public_url`
- `message_id`
- `sent_at`
- `delivery_source`
- `report_status`
- `success`
- `error`

Python remains the source of truth for final NeoSoft delivery status updates.

## Delivery Status Rules

Phase 1 recommendation:

- `FULL_REPORT` -> attempt delivery through Mirth
- `PARTIAL_REPORT` -> mark partial and skip auto-send for now
- anything else -> skip auto-send

Suggested Python final status mapping:

- Mirth success -> `S / WHATSAPP / OK`
- FTP failure -> `F / WHATSAPP / FTP FAILED`
- WhatsApp failure -> `F / WHATSAPP / WHATSAPP FAILED`
- partial report -> `P / WHATSAPP / PARTIAL REPORT`
- invalid or missing PDF -> `F / WHATSAPP / DOWNLOAD FAILED`

If current NeoSoft message-code mappings do not yet include `FTP FAILED`, Phase 1 can temporarily collapse it into `WHATSAPP FAILED` and refine later.

## Phase 1 Deferred Items

These are explicitly out of scope for Phase 1:

- QR code generation
- QR stamping on every page of the PDF
- multiple document variants
- asynchronous callback delivery from Mirth
- retry queues and alerting beyond basic logging

## Phase 2 Preview

Later, for QR authentication:

1. Mirth uploads or determines the final public URL.
2. Mirth generates a QR code from that public URL.
3. Mirth stamps the QR code onto every page of the PDF.
4. Mirth uploads the QR-stamped PDF as the delivered artifact.
5. Mirth returns both source and delivered-file details.

This changes the PDF pipeline enough that it should remain a separate phase.

## Immediate Next Steps

1. Build a minimal Mirth HTTP Listener that validates JSON and returns a mock success response.
2. Update Python to stage reports to the agreed local folder and `POST` the request payload.
3. Replace the mock Mirth response with real FTP upload and public URL creation.
4. Add WhatsApp template send in Mirth and return `message_id`.
5. Persist the returned delivery result from Python into NeoSoft delivery status APIs.
