# Labbit Home Sample Collection Platform

This project powers the home blood sample collection workflow for lab executives (HV Executives) and admin teams.

---

## 🚀 Getting Started (Local Dev)

To run the project locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/labbit-23/labbit-main.git
   cd labbit-main
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:

   Create a `.env.local` file in the root directory and add:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧱 Tech Stack

- Next.js 14 (App Router)
- Supabase (Database + Auth)
- Tailwind CSS (UI)

---

## 📁 Directory Structure

- `/app/phlebo` — Mobile dashboard for HV Executives
- `/app/admin` — Admin dashboard (upcoming)
- `/public` — Static assets
- `/README.md` — Project documentation

---

## ✅ Features

- Executive visit schedule filtered by date
- Color-coded status for visit progress
- Self-assignment for unassigned visits
- Supabase integration for real-time data

---

## 🔒 Authentication

Auth via Supabase — upcoming:
- Executives: Login using email and stored password
- Admin: Separate dashboard with access controls
- Patients: Signup with validation

---

## 📌 Deployment

This project is deployed via Vercel.

Ensure that Supabase keys are stored as environment variables in the Vercel project settings.

### VPS Frontend Deploy Script

If you are running the frontend on a VPS (PM2), use:

```bash
bash scripts/deploy-vps-frontend.sh
```

Default assumptions:
- app path: `/opt/labbit-frontend`
- branch: `main`
- PM2 app name: `labbit-frontend`
- health endpoint: `http://127.0.0.1:3000/api/health`

You can override them:

```bash
APP_DIR=/opt/labbit-frontend BRANCH=main PM2_APP_NAME=labbit-frontend bash scripts/deploy-vps-frontend.sh
```

Ops runbook (frontend + API + PM2):
- `docs/vps-operations-runbook.md`

CTO log viewer design + schema:
- `docs/cto-log-viewer-phase1.md`
- `docs/cto-events-schema.sql`


# Labbit Platform

A Next.js-based platform for home/sample blood collection, B2B sample logistics, and patient/lab management, built for high scalability, operational efficiency, and flexibility.

---

## Table of Contents

- [Project Overview](#project-overview)
- [User Roles & Flows](#user-roles--flows)
  - [Admin](#admin)
  - [Patient](#patient)
  - [Executive: Phlebo & Logistics](#executive-phlebo--logistics)
  - [B2B/Collection Centre](#b2bcollection-centre)
- [Core Features](#core-features)
- [Architecture](#architecture)
  - [Frontend: Next.js & Chakra UI](#frontend-nextjs--chakra-ui)
  - [Backend/API: Supabase & Next.js API](#backendapi-supabase--nextjs-api)
  - [Authentication & Authorization](#authentication--authorization)
  - [Storage/Attachments](#storageattachments)
- [Database Structure](#database-structure)
- [Key Components & Forms](#key-components--forms)
- [API Endpoints](#api-endpoints)
- [Development Guide](#development-guide)
- [Extending the Platform](#extending-the-platform)
- [Deployment](#deployment)
- [Testing & Debugging](#testing--debugging)

---

## Project Overview

Labbit is a platform for digital transformation of diagnostic operations―supporting both direct-to-patient home collection (B2C) and B2B (hospital/lab/clinic) sample pickup logistics.  
The system provides:

- Effortless booking for patients/clients.
- Secure access and status management for executives (phlebotomists, logistics staff).
- Full-process tracking, scheduling, and notification flows for lab admins.
- Extendibility for B2B (multi-branch, multi-user clinics/labs) and regional/city scalability.

---

## User Roles & Flows

### Admin

- Manage labs, collection centres/branches, executives, packages, test menus.
- Can view and manage all records—patients, pickups, visits, users—with full audit logs.
- Analytics, reporting, exception/deviation management.

### Patient

- (B2C) Use web/mobile to search for tests/packages, check prices, book home blood collection.
- Receives appointment confirmation, sample status, and result notifications.
- Sees full order/booking history.

### Executive: Phlebo & Logistics

- **Phlebo:** Sees assigned bookings, patient details, tests/packages, addresses, notes, and prescription attachments.
- Updates collection/completion status and uploads reports/prescriptions as needed.
- **Logistics:** Sees pending sample pickups (from B2B/collection centres), marks as picked/dropped, manages multi-branch/city assignments.

### B2B/Collection Centre

- Each branch (hospital/clinic) or B2B client is a `collection_centre` in the DB.
- Users with `requester` role (could be receptionist, staff, etc.) login to view/request pickups for their centre.
- Multiple users and logistics staff can be assigned to each centre (with the join table).
- Pickup requests, size/logistics preferences, status tracking, and (in future) manifests/inventory handled here.

---

## Core Features

- Multi-role login system; session-based with iron-session managing cookies.
- Booking & pickup flows:
  - Full B2C appointment/visit scheduling.
  - B2B sample pickup request and live pickup/drop tracking.
- Patient prescription upload/preview (image/PDF) with Supabase storage.
- Dynamic routing and layouts using Next.js App Router.
- Responsive mobile-first UI.
- Audit trail for every important action.
- Extensible master data: labs, collection centres, packages, status lookups.

---

## Architecture

### Frontend: Next.js & Chakra UI

- All pages and components under `/app`.
- Uses Chakra UI for consistent, accessible forms, tables, and cards.
- Tabs, modals, status indicators, image/PDF previews.
- Custom hooks for session, user, and role-aware routing.

### Backend/API: Supabase & Next.js API

- Postgres database (via Supabase) for structured, auditable data.
- Supabase Storage for files (prescriptions, report uploads).
- `/app/api` contains RESTful API endpoints for all core resources (visits, pickups, etc.).
- All API handlers use central Supabase client and uniformly structured with NextResponse for error/success.

### Authentication & Authorization

- App uses `iron-session` to manage secure server-side sessions via encrypted cookies.
- Custom auth flow stores user identities, roles, and executive IDs in these sessions.
- API routes extract the user session from the iron-session cookie to enforce role-based access and data filtering.
- Supabase Auth may be involved for initial signup/password tasks but session persistence is handled via iron-session.

### Storage/Attachments

- File uploads (e.g., prescriptions) go to Supabase Storage buckets (`uploads/prescriptions`) via API.
- Direct links or signed URLs are fetched and rendered as image or PDF preview in Visit and Pickup detail screens.

---

## Database Structure

- **labs**: Main lab/master organization records.
- **collection_centre**: B2B clients/branches, linked to one main lab.
- **executives**: All users (admins, phlebo, logistics, collection centre staff); differentiated by role in join tables.
- **executives_collection_centres**: Many-to-many user-to-collection centre assignments with roles (`requester`, `logistics`, `admin`).
- **sample_pickups**: Pickup requests with status, timestamps, assignments, linked to collection centres and executives.
- **visits**: Patient booking/visit records, with linked packages, test selection, and prescription file/text.
- **visit_statuses**: Lookup for visit and pickup statuses with order and notifications.
- **visit_activity_log**: Auditable log of changes with timestamps, users, and remarks.

---

## Key Components & Forms

- `VisitDetailTab`: Detailed visit view with status controls, prescription preview, test/package selection.
- `TestPackageSelector`: Lab test/package selection UI for booking and updating visits.
- `PickupList`: Lists daily pickups with real-time state and action buttons.
- `LogisticsTabs`: Tab-based navigation for pickup workflow stages.
- `CompareModal`: Test/package comparison tool for patients.
- `AssignExecutiveModal`: Admin modal to assign phlebo/logistics executives.
- Forms built with Chakra UI components ensuring accessibility and consistency.

---

## API Endpoints

- `GET /api/visits?patient_id=`: Fetch visits with linked tests, executive, prescription.
- `GET /api/pickups?status=&collection_centre_id=`: Fetch pickups filtered by status and collection centre, limited to user's assigned centres.
- `POST /api/pickups`: Create a new pickup request.
- `PUT /api/pickups`: Update pickup status, assignments, or notes.
- `GET /api/visits/status`: Get visit and pickup status codes and labels.
- `POST /api/visits/upload-prescription`: Upload prescription files.
- APIs respond with JSON, include error handling, and require authentication via iron-session.

---

## Development Guide

- **Install:**  
