# IV Consulting student learning portal

## What will be built

- Replace the blank home screen with a branded, mobile-friendly learning portal for Inyapa Vhusiku Consulting, using the confirmed Roboto type, red/blue/orange/charcoal palette, and six clearly named placeholder modules.
- Add email-and-password sign-in, password recovery, student profiles (full name, student ID, Student/Admin role), first-login copyright notice, and module assignments.
- Create Cloud tables and row-level access rules for profiles, roles, modules, course content, assignments, progress, and access history. Seed six placeholder modules. Keep course files in private storage.
- Give students a dashboard, searchable module library with Textbooks / Videos / Podcasts, in-app viewing controls, saved learning progress, visible personal watermarks, and download-deterrent controls.
- Give administrators a clear upload/publish/edit/hide/restore workflow, student assignment tools, activity summaries, a leak-report view, and plain-language protection guidance.
- Add plain-language setup and admin quick-start guides, then verify the public sign-in flow and available app behavior.

## Protection limits and setup dependencies

Private storage, verified account and module access, expiring media links, and account-specific watermarks will deter casual sharing and make leaks traceable. Browser-delivered content can still be captured or reconstructed; screen recording and photography cannot be reliably blocked. No real admin or student accounts will be created until their email addresses are supplied. Placeholder modules will be seeded, but no actual course media, student assignments, or video-hosting DRM credentials were provided.

## Technical approach

- Preserve the existing Lovable TanStack Start and React stack rather than replace it with Next.js; retain the existing server-side authentication and request protections.
- Use Lovable Cloud authentication, a private storage bucket, and additive public-schema migrations with explicit grants, row-level rules, and protected role checks.
- Keep secret-bearing and authenticated data access server-side; issue short-lived access for authorized course media and use client-only PDF rendering when needed.
- Use the existing semantic design-token system, app UI controls, and the existing test and preview workflows.
