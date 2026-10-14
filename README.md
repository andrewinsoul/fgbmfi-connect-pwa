# FGBMFI Connect PWA

A responsive Next.js PWA frontend for the existing FellowshipApi Phoenix backend.

## Pages included

- Welcome / entry screen
- Sign in
- Registration
- Forgot-password request (API currently returns a placeholder; delivery is not implemented)
- Home dashboard
- Check-in status and confirmation
- Check-in success / already checked in
- Attendance history with pagination
- Published quotations / scripture with pagination
- Next meeting
- Member profile editing
- Notification preferences
- Sign out

The design follows the FGBMFI Connect identity: purple, white and gold; tagline “Connected in fellowship. Growing in faith.”

## Requirements

- Node.js 20+
- The Phoenix API running locally (default `http://localhost:4000`)
- The API database migrated and seeded

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

`PHOENIX_API_URL` is the Phoenix origin **without** `/api/v1`. Example:

```env
PHOENIX_API_URL=http://localhost:4000
```

The Next.js route handler proxies `/api/backend/*` to the Phoenix API, so the browser does not need cross-origin access to Phoenix. On login/registration it stores the Phoenix bearer token in an `HttpOnly`, `SameSite=Lax` cookie for 30 days, matching the current backend token lifetime. The browser JavaScript does not read the token. Sign-out clears the cookie; the current Phoenix logout endpoint does not revoke the signed token server-side.

For production, set `PHOENIX_API_URL` to the private/reachable API origin and serve the PWA over HTTPS. Cookies use `Secure` when `NODE_ENV=production`.

## API integration notes

- API base path is `/api/v1`.
- Dashboard uses `GET /home`.
- Login: `POST /auth/login` with `{ "login": "email-or-phone", "password": "..." }`.
- Registration: `POST /auth/register` with `full_name`, `email`, `phone_number`, `gender`, `password`. The backend combines registration with check-in and can reject it when check-in is closed.
- Check-in: `GET /check-in/session`, then `POST /attendance/check-in`.
- Attendance: `GET /attendance?page=1&page_size=20`.
- Scripture: `GET /quotations?page=1&page_size=20`.
- Profile: `GET /profile`, `PATCH /profile`.
- Preferences: `GET/PATCH /notification-preferences`.

## Known backend limitations reflected in the UI

- The API does not currently expose a QR-validation endpoint. The UI therefore offers a check-in confirmation action, not a fake QR scanner.
- Password-recovery delivery is not implemented in Phoenix yet.
- Notification preference values can be saved, but actual push/email delivery is not implemented by the current API.
- The current API quotation endpoints return published quotations from the `quotations` table. Verify your Bible seed marks the imported verses as published and that the backend quotation query returns a random verse if that is the intended behaviour.
- `POST /auth/logout` tells the client to discard the token but does not revoke it server-side.
- The PWA shell can fall back to the cached entry page while offline, but authenticated data is intentionally not cached. Online connection is required to sign in and load account data.

## Before production

1. Test all screens against the running API and check the exact validation payloads.
2. Add a proper app icon set and test install prompts on iOS/Android.
3. Configure deployment and HTTPS.
4. Add CSRF protections and review the cookie/proxy architecture before public launch.
5. Implement real push notifications and password reset in the API if required.
