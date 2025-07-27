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
