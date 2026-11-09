# Learn French Academy

Tutor dashboard for Learn French Academy: today's classes, resource library, weekly schedule, students and class reports.

**Stack:** React + Vite, Supabase (logins, database), Cloudflare Pages (hosting).

## Run locally
```
cp .env.example .env   # add the Supabase URL and publishable key
npm install
npm run dev
```

## Database
`supabase/schema.sql` creates the tables and access rules. Run it once in the Supabase SQL editor.

## Deploy (Cloudflare Pages)
Build command `npm run build`, output folder `dist`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` as environment variables.
