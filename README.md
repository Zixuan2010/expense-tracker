# Expense Tracker

React (Vite) and an Express API are deployed as one Vercel project. The browser calls relative `/api/...` URLs; there is no cross-origin API configuration.

## Local development

Copy `.env.example` to `.env` and fill in the Turso and Firebase values. Keep `.env` private.

In separate terminals, run:

```bash
npm run server
npm run dev
```

The API listens on port 3001. Vite proxies `/api` requests from its development origin to that server, so the frontend uses the same API paths locally and on Vercel.

## Vercel deployment

Import this repository as **one** Vercel project with the repository root as the project root. `vercel.json` selects Vite and builds `dist`; `api/handler.js` runs the Express API as a Vercel Function.

Set these environment variables in Vercel for the environments you deploy:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

The `VITE_` values are used by the frontend build; `VITE_FIREBASE_PROJECT_ID` is also used by the API to verify ID tokens. Do not prefix the Turso token with `VITE_`.

In Firebase Authentication, enable Google and Email/Password sign-in and add the deployed Vercel hostname to **Authorized domains**. Redeploy after changing frontend environment values so Vite can include them in a new build.
