# StudentPath — Student Journey Analytics

Built with React + Vite and Supabase.

StudentPath is a student journey analytics prototype that brings attendance, assessments, interventions, and outcomes into one educator dashboard. Looking at these signals together can help staff notice students who may need timely support; indicators are prompts for human review, not diagnoses or validated predictions.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## StudentPath local setup

The dashboard uses the existing Supabase project. Copy `.env.example` to `.env.local` and configure the project URL and public `anon`/publishable key:

```env
VITE_SUPABASE_URL=https://fedunanpjfqiusehhogy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=replace-with-the-project-publishable-key
```

Get the publishable key from the Supabase project's API settings. Never put a service-role key, secret API key, or database password in a `VITE_` variable or browser code. Restart Vite after changing `.env.local`.

If login reports that the publishable key is missing or still a placeholder, replace the placeholder with the project's public key and restart the dev server. A running page cannot receive changed Vite environment variables until it restarts.

The app offers password sign-in for existing accounts only; it does not implement public registration. It restores the Supabase session after reload and signs out through Supabase Auth. Dashboard reads use the authenticated Supabase client for `students`, `attendance_records`, `assessments`, `interventions`, and `student_outcomes`; RLS remains the database access boundary. A Supabase publishable key is public by design, but must never be replaced by a service-role/secret key.

### Student, faculty, and admin roles, protected access, and RLS

The application supports three trusted roles:

- **Admin:** the authenticated Supabase session has trusted `app_metadata.role = "admin"`. Admin users enter the existing college-wide dashboard.
- **Student:** the user is linked to exactly one `students` row by `students.auth_user_id`. Linked users enter the student portal. Unlinked users are denied; a browser-provided role or `user_metadata` never grants admin access.
- **Faculty:** the authenticated session has trusted `app_metadata.role = "faculty"` and at least one active row in `faculty_assignments`. Faculty can view only assigned students; an administrator alone can create or change assignments.

The app routes these views after session restoration, but the database is the security boundary. Review [`supabase/student_faculty_assignments.sql`](./supabase/student_faculty_assignments.sql) and [`supabase/student_access_policies.sql`](./supabase/student_access_policies.sql); they are SQL migration templates and are **not run automatically**. The access migration assumes `students.id` is the primary key and `attendance_records`, `assessments`, `interventions`, and `student_outcomes` each have a `student_id` referring to it. The migrations enable RLS, remove existing client table grants, and use trusted claims and active assignments to constrain reads. Admin-only policies control assignment changes and official record edits, except faculty may insert an intervention only for a currently assigned student. Review compatibility with existing policies and other applications before running these SQL files.

The student portal also requires [`supabase/student_portal_modules.sql`](./supabase/student_portal_modules.sql). It creates timetable, fee, leave request, announcement, and support request tables with RLS. Students can read only their own module data and published announcements; they may submit their own leave/support requests, but cannot approve or edit them. Admins can manage all module records. New module tables store `student_id` as text and compare it with `students.id::text` to support the existing identifier type.

The additional [`supabase/student_growth_features.sql`](./supabase/student_growth_features.sql) migration adds personal goals/tasks, skills, journey events, study plans/tasks, explainable risk records, notifications, and private mentor conversation/sharing tables. Students own their goals, plans, conversations, and messages; assigned faculty can read only the explicitly shared conversation and selected journey/skills/planning data while the assignment remains active. Database security-definer helpers are limited to boolean ownership/assignment checks and use a fixed search path. The student AI mentor lives in [`api/mentor.js`](./api/mentor.js), reads only the signed-in student's aggregate attendance/assessment data under RLS, and stores assistant replies only from the server endpoint.

#### Apply the migration in Supabase

1. Open **Supabase Dashboard → SQL Editor** for the project and inspect the live columns, foreign keys, grants, and `pg_policies` for the existing tables. Confirm the access migration assumptions and check for other applications that depend on existing grants/policies. Do not proceed if the schema differs; adapt the migration first.
2. Run `supabase/student_faculty_assignments.sql` first. It adds an assignment table with no foreign key to the installation-specific student ID type; faculty access remains inactive until an administrator creates active assignments.
3. Review and run `supabase/student_access_policies.sql` to apply authenticated row scopes. This file redefines its named policies and adds the faculty assignment condition; it does not run automatically.
4. Inspect `supabase/student_portal_modules.sql` and confirm its tables and data retention fit your institution. Copy/paste it into a new SQL Editor query and run it after the access migration succeeds.
5. Link each student Auth UUID to its existing student row. In the SQL Editor, use the query below after replacing both placeholders with the exact values from **Authentication → Users** and the intended student row. Repeat carefully for each student:

   ```sql
   update public.students
   set auth_user_id = 'STUDENT-AUTH-USER-UUID'::uuid
   where id = 'EXISTING-STUDENT-ROW-ID';
   ```

   Confirm exactly one row was updated and that no Auth UUID is assigned to a different student. The migration adds a unique constraint to prevent one Auth user being linked to multiple students.
6. Set each role through a trusted server-side Auth Admin API process: `app_metadata.role` must be `admin` or `faculty` as appropriate. Never set it from the browser, `user_metadata`, or client SQL, and never expose a service-role key. Create faculty assignments only as an authenticated admin. Sign out and back in after changing trusted claims.
7. After the access and portal migrations succeed, review and run `supabase/student_growth_features.sql`. If its SQL reports an error, stop and share the error text rather than partially retrying or disabling RLS.
8. Keep public sign-ups disabled. Inspect the resulting RLS policies and table grants again before testing with real student information.

#### Access test checklist

Use separate Auth accounts: Student A linked only to A's row, Student B linked only to B's row, one assigned faculty account, one unassigned faculty account, and the trusted admin.

1. Sign in as Student A. Confirm the portal shows only A's profile and records; attendance, marks, interventions, and outcomes must not include B's data.
2. Sign out, sign in as Student B, and confirm the corresponding B-only view. Compare record counts or known test rows to ensure A's data does not appear.
3. Sign in as assigned faculty. Confirm only active assignments appear and assigned attendance, assessment and intervention rows load. Try querying a different student's ID directly and confirm RLS returns no private rows.
4. Sign in as unassigned faculty and confirm the account is denied. Sign in as the admin and confirm the existing dashboard can read college-wide rows, manage assignments in **Manage Records**, and perform authorized CRUD/CSV actions.
5. Sign out, then attempt a read without an authenticated session using only the public publishable key. Confirm Supabase returns no private records.
6. Sign in with a valid Auth user that has no trusted admin/faculty claim and no linked student record. Confirm access is denied.
7. Repeat after a page reload to confirm session restoration does not change the role boundary. Review browser network responses and Supabase logs for errors; do not rely only on hidden navigation.

Real database isolation is **not verified** until this checklist has been completed against the configured Supabase project.

### Run with PowerShell

If Node.js is installed in its standard Windows location, open PowerShell and run:

```powershell
Set-Location 'C:\Users\Dell\Downloads\student'
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. If Node.js is installed elsewhere, add its install directory to `PATH` instead. `npm.cmd` avoids PowerShell script execution-policy restrictions on `npm.ps1`.

### Dashboard data notes

The app derives student totals, attendance averages, active intervention counts, risk indicators, department pass rates, and recognized retention outcomes from table records. Risk indicators are transparent thresholds, not validated predictions. Department pass rates currently use a 50% assessment threshold. Retention is calculated only for recognized outcome statuses; unrecognized statuses are not silently counted as retained. Missing dated records produce chart empty states.

## Student portal preview

The login page includes **Preview student portal with sample data**. This read-only preview contains one clearly labeled fictional example to demonstrate student-facing navigation and content. It does not read or write student records, call mentor services, or save changes. Its sample values must not be presented as actual student information.

Actual student information is shown only after sign-in with an institution-assigned student account that is linked to a student record and authorized by Supabase Row Level Security. Administrator analytics likewise require an authenticated administrator account. Confirm the project configuration and database policies before using real student information.

### Deploying the prototype

1. Run `npm.cmd run build` locally and confirm the `dist` directory is produced.
2. The local Git repository is initialized. Confirm `.env.local` is ignored and `.env.example` is included before your first push. From PowerShell:

   ```powershell
   Set-Location 'C:\Users\Dell\Downloads\student'
   git status --short
   git check-ignore -v .env.local
   git add .
   git commit -m "Prepare StudentPath prototype"
   git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Replace the GitHub URL placeholder with your repository URL. If Git asks for a name/email, configure your Git identity first. Never force-push or commit `.env.local`.
3. Import the repository into Vercel and follow the environment variable and verification steps below.
4. Keep public registration disabled and never present fictional preview data as database output.

The AI endpoint accepts authenticated requests, verifies the bearer token with Supabase Auth, and uses only the trusted `app_metadata.role` admin claim or a student mapping in `students.auth_user_id`. It ignores client-supplied metrics and reads records server-side through the caller's RLS-protected session. Only non-identifying aggregates are sent to Groq. Student-level metrics remain personal learning information despite excluding names, so enable this feature only if that processing is approved. Responses are labeled **AI-generated**, are not diagnoses or predictions, and require human review. `GROQ_API_KEY` is server-only.

For Vercel deployment:

1. Push the project to GitHub only after confirming `.env.local` is ignored with `git check-ignore -v .env.local`; keep `.env.example` as placeholders only.
2. Import the repository into Vercel. Use `npm run build` as the build command and `dist` as the output directory. Vercel discovers `api/insights.js`.
3. In Vercel Project Settings → Environment Variables, configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the public anon/publishable key), `SUPABASE_SERVICE_ROLE_KEY`, and `GROQ_API_KEY`. The service-role key is required only for the server-side mentor endpoint to persist verified assistant replies after it checks the caller's token, student mapping, and conversation ownership. Store it only as a Vercel server environment variable: never use a `VITE_` prefix, never commit it, and never share it in chat. Do not use the service-role key to read student data; student context is fetched with the user's token and RLS.
4. Redeploy and add the deployed domain to Supabase Auth's allowed site and redirect URLs. Test password login/recovery, session restoration, student isolation, admin access, student requests, CSV export, and AI responses over HTTPS.
5. For local serverless-function testing, configure the server variables in the local Vercel environment and run `npx.cmd vercel dev` from PowerShell. Plain `npm.cmd run dev` serves Vite only, not `/api/insights`.
6. Test the AI mentor endpoint only after the growth migration is installed and all server-only variables are configured. The server endpoint rejects admin/faculty sessions and unlinked accounts; it does not function on the plain Vite dev server.

Do not claim the new database modules, role isolation, or AI endpoint is live until both SQL migrations are reviewed/applied and tested with separate accounts and configured Vercel server variables.

### Replit deployment

The Replit deployment configuration builds the Vite app and starts `server.js`, which serves the built site and routes `/api/insights` and `/api/mentor` to the server-side handlers. Deploy as a Node.js app (Autoscale), not as a static-only site.

1. Import this repository into Replit and add the required values in **Secrets** before deploying. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the frontend build. For the server-side endpoints, set `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`), and `GROQ_API_KEY`. Set `SUPABASE_SERVICE_ROLE_KEY` only if using the AI mentor, which stores assistant replies server-side. Never use a `VITE_` prefix for server secrets.
2. Use the configured deployment build and run commands (`npm run build` and `npm run start`) and publish from Replit's **Deployments** panel. Replit generates the public URL after deployment succeeds; this repository does not itself create that URL.
3. Add the generated domain to Supabase Auth's allowed site and redirect URLs. Review and apply the Supabase migrations and test sign-in and role/data isolation before sharing the app with real users.
