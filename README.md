# Labbit - Home Sample Collection Platform

Labbit is a lightweight web platform for managing and tracking home sample collection visits by healthcare professionals (HV Executives). It is powered by Supabase and built using Next.js 14+ with Tailwind CSS.

## 🔧 Features

- Executive dashboard to view daily visits
- Status color coding (pending, in progress, picked, dropped)
- Filter visits by date: today, yesterday, tomorrow
- Dropdown to view visits for any executive
- Unassigned visits list for self-assignment (coming soon)
- Secure backend powered by Supabase (Postgres, Auth, API)

## 📁 Tech Stack

- **Frontend:** Next.js (App Router), Tailwind CSS
- **Backend:** Supabase (DB + Auth + Realtime)
- **Deployment:** Vercel
- **Language:** JavaScript (ES6+)

## 🗃️ Supabase Schema Highlights

- `executives`: name, phone, status
- `patients`: name, phone, dob, gender
- `visits`: patient_id, executive_id, date, time_slot, address, status
- `visit_details`, `results`: for test tracking

## 🧪 Sample Visit Statuses

| Status           | Color        | Notes                     |
|------------------|--------------|----------------------------|
| `pending`        | Yellow       | Not yet started            |
| `in_progress`    | Blue (blink) | Executive en route         |
| `sample_picked`  | Green        | Sample collected           |
| `sample_dropped` | Purple       | Sample handed to lab       |
| `null`           | Gray         | Unassigned                 |

## 🔐 Environment Variables

Set the following in your `.env.local` (already set in Vercel):

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
