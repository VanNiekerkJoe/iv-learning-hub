# IV Learning Hub

Build a secure learning web app for students of Inyapa Vhusiku Consulting (IV Consulting), a South African accredited training provider. Students log in and access 6 modules. Each module contains textbooks (PDF), videos, and podcasts (audio). An admin manages all content. The two non-negotiables are: (1) the admin is not technical, so every content action must be extremely easy and quick, and (2) content must be protected as far as is realistically possible from being downloaded, copied, or resold. Everything must be consumed inside the web app.

## 1. Brand and design
Match the look and feel of https://ivconsulting.co.za/. Use this palette as CSS variables / Tailwind theme tokens:

- --brand-blue (primary action colour): #00AEEF. Used for buttons, links on light backgrounds, active tabs, progress bars.
- --brand-red (headline and nav accent): #D4202A. Used for navigation text, accent words in headings, destructive actions ("Delete"), warnings, and important highlights.
- --brand-orange (decorative accent): #F5A31A. Used for diagonal divider shapes, thin accent lines under headings, badges, and "in progress" states.
- --brand-black: #000000. Used for hero sections and dark mode background.
- --brand-charcoal: #222222. Used for the top utility bar, admin sidebar, and footer.
- --white: #FFFFFF. Used for the main page background and header.

(These hex values are estimates from the live site. If exact values can be extracted from https://ivconsulting.co.za/, prefer those.)

Typography: Roboto (Google Fonts). Headings in Roboto Bold, with the key phrase of a heading in red. Body text in Roboto Regular.

Layout and style cues from the site:
- Slim charcoal top bar with contact details (Tel: +27 (0)10 001 7324, Email: inyapavhusiku@gmail.com) and a LinkedIn icon.
- White header with the IV logo on the left, nav links in red, and a rounded pill-shaped blue call-to-action button on the right.
- Dark (black) hero sections with large white bold headings and a red accent line, separated from imagery by a bold diagonal orange stripe. Reuse this diagonal orange stripe motif on the login page and the student dashboard header.
- Logo: https://ivconsulting.co.za/wp-content/uploads/2024/10/logo.png (header and login page).
- Clean, professional, plenty of white space, WCAG AA contrast minimum. Never use orange for body text. Use white text on blue only at large or bold sizes.
- Mobile-first. Many students are on phones with limited data, so keep pages light and lazy-load media.
- Footer: charcoal background, white text, "Copyright 2026 – Inyapa Vhusiku Consulting", email and phone.

App-specific styling:
- Student dashboard: black/charcoal hero strip with the student's name and an orange diagonal accent, then 6 white module cards, each with a blue "Open module" button and an orange progress bar.
- Module tabs (Textbooks / Videos / Podcasts): active tab in blue with a thin orange underline.
- Admin panel: white background, charcoal sidebar, blue primary buttons ("Add Content", "Publish"), red for destructive actions.
- Light and dark mode.

## 2. Tech stack (use unless there is a strong reason to change)
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth, Postgres, Row Level Security, Storage with PRIVATE buckets)
- Video: Mux or Cloudflare Stream with signed playback tokens and HLS streaming
- Audio: HLS or short-lived signed URLs from private storage
- PDFs: rendered page-by-page in the browser (PDF.js on canvas), never exposed as a downloadable file URL
- Deploy on Vercel
- If budget is a concern, suggest a lower-cost alternative for video hosting (for example self-hosted HLS with signed URLs).

## 3. Roles
- Student: view assigned modules and consume content only.
- Admin: full content and student management.

## 4. Student experience
- Login with email and password (admin creates accounts or sends invites). Include "forgot password".
- Dashboard: 6 module cards, each with a title, short description, and progress bar.
- Module page: three clearly labelled tabs (Textbooks, Videos, Podcasts), plus a search box.
- Built-in viewers only:
  - PDF viewer: page scroll, zoom, page jump, "continue where you left off".
  - Video player: play/pause, speed control, resume position, automatic quality selection for low data. No download button.
  - Audio player: play/pause, speed control, resume, sleep timer, background playback.
- Track progress per item (not started, in progress, completed).
- Large tap targets and readable fonts.

## 5. Admin experience (most important: frictionless)
Design for someone who is not technical. Rules:
- One Admin Panel with big labelled buttons and plain English. No jargon.
- Upload: a drag-and-drop zone plus a big "Add Content" button. Admin picks the module, then drops a file. The app auto-detects the type (PDF = textbook, MP4/MOV = video, MP3/M4A/WAV = podcast). The title auto-fills from the file name and is editable. Optional description. One click on "Publish".
- Bulk upload (drop 10 files at once) with a progress bar per file and automatic retry on failure. Chunked, resumable uploads for large videos.
- Edit: click any item to rename it, change its description, move it to another module, replace the file, reorder by drag-and-drop, or hide/unhide it.
- Delete: a big red button with a friendly confirmation (for example "Remove 'Module 2 Intro Video'? Students will no longer see it."). Soft-delete with a 30-day "Recently deleted" bin so mistakes can be undone in one click.
- "View as student" preview button.
- Manage students: add one by email, bulk-add via CSV, deactivate/reactivate, reset password, assign modules.
- Simple stats page: active students this week, most-viewed items, last login per student.
- A confirmation toast for every action ("Saved", "Uploaded", "Deleted. Undo?"). Never leave the admin guessing.
- Built-in "How to" help panel with short tooltips or screenshots.

## 6. Content protection (anti-piracy)
Be realistic: perfect prevention is impossible, so layer deterrents and traceability.
1. No direct file access. All files live in private storage. Content is served only through short-lived (60 to 120 seconds) signed URLs or tokens, generated server-side after verifying the user's session and module access. Never expose permanent links.
2. Videos: HLS streaming with signed tokens, no MP4 download link, disable right-click and the native download and picture-in-picture options. Use DRM (Widevine/FairPlay via Mux or Cloudflare) if available.
3. PDFs: render as canvas pages via PDF.js. Do not serve the raw PDF to the browser. Disable print, save, and text selection or copy in the viewer. Optionally pre-convert pages to images server-side.
4. Audio: stream via signed, expiring URLs. No download control.
5. Dynamic watermarking: overlay the student's name, email, and student ID, semi-transparent and repositioning periodically, on every PDF page and video. Leaks become traceable to an account.
6. Session control: one active session per student (a new login logs out the old one), or a maximum of 2 devices. Auto-logout after inactivity. Flag suspicious activity (many simultaneous IPs, unusually fast bulk access) and alert the admin.
7. Rate limiting on content requests, plus a server-side access log (who opened what, when, from which IP).
8. Client-side deterrents: disable right-click, text selection, drag, and print/save shortcuts (Ctrl+P/S/U), and block DevTools shortcuts where practical. Pause or blank video playback when the tab loses focus, as a screenshot deterrent.
9. Terms: students must accept a notice on first login ("Content is copyrighted. Sharing or reselling is prohibited and may result in account removal"). Show a short reminder in the viewers.
10. Admin tools: one-click "Revoke access" for a student, and a "Leak report" view showing the access log per student.
Include an honest note in the admin help section that screen recording and photographing a screen cannot be fully blocked, and that watermarking is what makes leaks traceable.

## 7. Data model (suggested)
- profiles (id, full_name, student_id, role, active)
- modules (id, title, description, position)
- content_items (id, module_id, type [pdf|video|audio], title, description, storage_path or stream_id, position, is_hidden, deleted_at)
- student_modules (student_id, module_id)
- progress (student_id, content_id, status, position_seconds, updated_at)
- access_logs (student_id, content_id, ip, user_agent, created_at)
Enforce all access with Row Level Security. Students can only read content in modules assigned to them.

## 8. Security basics
- HTTPS only, secure and HttpOnly cookies, CSRF protection, input validation, file-type and size validation on upload, virus scan of uploads if possible.
- Passwords handled by Supabase Auth with strong password rules.
- Admin routes protected server-side, not just hidden in the UI.

## 9. Deliverables
1. Full working codebase with a clear folder structure.
2. Database schema and RLS policies as SQL.
3. A .env.example listing required keys.
4. Step-by-step deployment instructions written for a non-developer.
5. Seed data: 6 placeholder modules, 1 admin account, 2 test students.
6. A one-page admin quick-start guide in plain language.

Priorities, in order: (1) the admin upload/edit/delete flow is effortless, (2) content cannot be downloaded directly, (3) the student viewing experience is smooth on mobile, (4) brand fidelity to ivconsulting.co.za.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20fd8e6f-01c9-46f2-9009-3d24fe4d9995).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
