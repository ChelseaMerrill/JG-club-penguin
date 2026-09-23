# Research: Google SSO auth implementation options

Ticket: [ChelseaMerrill/JG-club-penguin#4](https://github.com/ChelseaMerrill/JG-club-penguin/issues/4) (part of the wayfinder map, #1)

Context: 3-day hackathon build. Google SSO must be the **sole** identity path (no email/password) — it establishes a **Player**'s persistent identity across **Session**s (see [CONTEXT.md](../../CONTEXT.md)). Team stack is polyglot: React/Vue/Next/vanilla JS/TS/Python, zero prior game-dev experience, heavy AI-assisted-coding fluency. Budget: free/low-cost preferred.

A parallel research ticket is separately evaluating realtime multiplayer backends: Colyseus, PartyKit, Supabase Realtime, Firebase (Realtime DB/Firestore), or a custom Socket.io server. This doc flags cross-platform synergy with each where relevant, but does not choose the realtime backend.

## Candidates evaluated

### 1. Firebase Authentication

- **Free tier**: Spark (free) plan includes standard providers — email/password, **Google**, Apple, GitHub, anonymous — for **50,000 MAU with no time limit**, confirmed on the official pricing page. Beyond that, Google Cloud Identity Platform pricing applies. Phone auth is billed separately regardless of plan. ([firebase.google.com/pricing](https://firebase.google.com/pricing))
- **Setup speed**: Fastest of the candidates for a plain "Sign in with Google" flow — the Firebase JS SDK's `signInWithPopup(auth, new GoogleAuthProvider())` returns a `User` object with `uid`, `displayName`, `email`, `photoURL` in a handful of lines, no OAuth-consent-screen plumbing beyond enabling the provider in the console. ([firebase.google.com/docs/auth](https://firebase.google.com/docs/auth))
- **Realtime backend synergy**: Strong same-project synergy if the team picks **Firebase Realtime Database or Firestore** as the multiplayer backend — one Firebase project covers auth + data + realtime, and Firestore free tier gives 1 GiB storage / 50K reads / 20K writes per day. Realtime Database free tier caps at **100 simultaneous connections**, which is a real ceiling to note if Firebase RTDB is chosen for Presence broadcast (each connected Session counts). ([firebase.google.com/pricing](https://firebase.google.com/pricing))
- **Framework/language fit**: Client SDKs exist for vanilla JS, React, Vue — no Next.js coupling. Firebase Admin SDK (for verifying ID tokens server-side, e.g. before admitting a Session into a Colyseus/PartyKit/Socket.io room) has an official **Python** package (`firebase-admin`), which matters given the team includes a Python developer.
- **Player data persistence**: `User.uid` is a stable identity key; store a `players/{uid}` Firestore document with `displayName`, `email`, and a `penguinColor` field — trivial to model and matches the Player/Penguin split in CONTEXT.md (Player = identity doc, Penguin = the `penguinColor` + position fields on it or a linked doc).

### 2. Supabase Auth

- **Free tier**: Free plan includes **50,000 MAU** and **Social OAuth providers** (Google included) at no cost — confirmed on the pricing page. ([supabase.com/pricing](https://supabase.com/pricing))
- **Setup speed**: Comparable to Firebase — enable Google provider in the Supabase dashboard, drop in client ID/secret, call `supabase.auth.signInWithOAuth({ provider: 'google' })`. Slightly more ceremony than Firebase because Supabase Auth's Google integration still routes through a full OAuth redirect (no One Tap/popup shortcut built in), but well documented. ([supabase.com/docs/guides/auth](https://supabase.com/docs/guides/auth))
- **Realtime backend synergy**: This is the standout case flagged by the ticket — **Supabase Auth + Supabase Realtime in one project** is the cleanest platform-sharing option among all combinations considered. Free tier Realtime gives **200 concurrent connections** and **2M messages/month**, and because Postgres Row Level Security can reference `auth.uid()` directly, Presence/Session rows can be scoped per-Player with zero custom auth glue. If the parallel realtime-backend ticket leans toward Supabase Realtime, this pairing should win by default. ([supabase.com/pricing](https://supabase.com/pricing))
- **Framework/language fit**: `supabase-js` covers vanilla JS/TS/React/Vue; a Python client (`supabase-py`) exists for a Python-side service if needed.
- **Player data persistence**: Auth already creates a row in the managed `auth.users` table; add a `public.players` table with a `user_id` foreign key holding `penguin_color` and any other Player fields — this is a relational model, arguably a more natural fit than Firestore's document model for a small, well-defined Player/Penguin schema.

### 3. Clerk

- **Free tier**: Hobby plan is free up to **50,000 Monthly Retained Users (MRU)** — note this is *retained* users (returned ≥24h after signup), not raw MAU, so it's more generous in practice than it looks. Social login (including Google) is included on the free Hobby tier, limited to **3 social connection providers** (one is enough here). Full **enterprise SSO** (SAML/OIDC) is Pro-only, but that's irrelevant since this project only needs consumer Google OAuth, not enterprise SSO. ([clerk.com/pricing](https://clerk.com/pricing))
- **Setup speed**: Very fast for a React/Next.js app — prebuilt `<SignIn/>`/`<UserButton/>` components and a hosted account portal mean near-zero custom UI work. Less turnkey for a vanilla-JS or Vue surface, where Clerk's SDK support is thinner than Firebase/Supabase's.
- **Realtime backend synergy**: No first-party realtime product, so no same-project synergy — but Clerk is explicitly documented as a supported JWT source for **PartyKit**'s auth guide, which demonstrates verifying a Clerk session token in `onBeforeConnect`. Also usable as a token issuer for Colyseus's JWT-based `onAuth()`. So: good *pairing* (not platform-sharing) with PartyKit specifically, and workable with any JWT-friendly realtime backend. ([docs.partykit.io/guides/authentication](https://docs.partykit.io/guides/authentication/))
- **Player data persistence**: `unsafeMetadata` on the Clerk user is the documented mechanism for user-editable custom fields (e.g. a chosen Penguin color) and is settable directly from the frontend/at sign-up; `publicMetadata` is the backend-controlled equivalent, readable on both ends. Either works for a `penguinColor` field, no separate DB required for MVP. ([clerk.com/docs/users/metadata](https://clerk.com/docs/users/metadata))

### 4. Auth.js (NextAuth)

- **Free tier**: Fully free and open source — no vendor MAU cap, no hosted service to pay for. As of 2026, Auth.js is maintained under the **Better Auth** organization (footer: "Auth.js © Better Auth Inc."), but remains free/open source software you self-host inside your own app. ([authjs.dev](https://authjs.dev))
- **Setup speed**: Minimal code for Google (`Google` provider, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` env vars, a callback URL registered in Google Cloud Console) — but Auth.js is designed to live *inside* a framework's server runtime (Next.js, SvelteKit, Express, etc.), not as a standalone identity service. That's a poor fit for a polyglot team where part of the stack is vanilla JS/Python and the realtime server is a separate process (Colyseus/PartyKit/Socket.io) — you'd need to either put Auth.js in front of a Next.js app specifically and then re-verify its session/JWT from the separate realtime server, or skip Auth.js's framework integration and use it in a more manual capacity, losing most of its "no glue code" appeal. ([authjs.dev/getting-started/providers/google](https://authjs.dev/getting-started/providers/google))
- **Realtime backend synergy**: None inherent — Auth.js has no realtime product. Works only if the team commits to Next.js as the single app shell and treats the realtime server as downstream of it.
- **Player data persistence**: Works with JWT-only sessions (no database adapter required) for a minimal build, but then Player data (Penguin color) has nowhere durable to live beyond the JWT payload itself; a real Player record needs one of Auth.js's database adapters (Prisma, Postgres, MongoDB, etc.), which is additional setup this team likely doesn't have time for on day 1.

### 5. Raw Google Identity Services (GIS)

- **Free tier**: Free — it's Google's own client library plus the standard OAuth 2.0/OIDC token exchange; no vendor tier at all. ([developers.google.com/identity/gsi/web](https://developers.google.com/identity/gsi/web/guides/overview))
- **Setup speed**: Slowest of all candidates for a working end-to-end flow. GIS gives you the client-side sign-in button/One Tap/credential response, but you are explicitly responsible for **verifying the ID token server-side yourself** (Google's own docs list this as a required "Advanced Configuration" step: [verify-google-id-token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)) and for building your own session/Player-record persistence layer from scratch. No managed user store, no built-in session cookie/JWT issuance, no admin dashboard.
- **Realtime backend synergy**: None — you're already writing all the glue, so GIS is realtime-backend-agnostic by construction (works equally with Colyseus, PartyKit, Socket.io, or anything else), but that "flexibility" is really just "you write the token-verification code once for whatever backend you pick," with no shortcuts.
- **Player data persistence**: Full control — decoded ID token gives `sub` (stable Google user id), `email`, `name`, `picture`; you own wherever you store the Player row and the `penguinColor` field. Most control, but also 100% DIY, which is the wrong trade for a 3-day build with no dedicated backend/auth specialist.

## Comparison summary

| | Free tier | Setup speed (3-day build) | Realtime pairing | Player data model |
|---|---|---|---|---|
| Firebase Auth | 50K MAU, no time limit, Google included | Fastest; minutes | Same-project w/ Firestore/RTDB (RTDB capped at 100 concurrent conns free) | Firestore doc per `uid` |
| Supabase Auth | 50K MAU, Google included | Fast; slightly more OAuth ceremony | **Best same-project synergy w/ Supabase Realtime** (RLS on `auth.uid()`) | Postgres row via FK to `auth.users` |
| Clerk | 50K MRU (retained), Google included on free tier | Fast for React/Next; thinner elsewhere | No own realtime product; documented JWT pairing with **PartyKit** | `unsafeMetadata`/`publicMetadata` on user |
| Auth.js | Free/OSS, no cap | Fast in Next.js only; awkward for polyglot/separate realtime server | None inherent | Needs a DB adapter for durable Player data |
| Raw GIS | Free | Slowest — DIY token verification + session + storage | None (backend-agnostic by virtue of being all custom) | Full control, full DIY |

## Recommendation

**Firebase Authentication.** For a 3-day hackathon with a polyglot team (React/Vue/Next/vanilla JS/TS/Python) and zero game-dev experience, Firebase Auth gives the fastest path to a working, sole-path Google sign-in: a first-party Google integration, a generous no-time-limit 50K MAU free tier, official client SDKs across every frontend flavor the team is using, and a Python-compatible Admin SDK for verifying ID tokens server-side regardless of which realtime backend (Colyseus/PartyKit/Socket.io/Firebase itself) the parallel research ticket lands on — minimizing framework lock-in risk before that decision is made. Persisting the Player record (identity + chosen Penguin color) is a one-document Firestore write keyed by `uid`, matching the CONTEXT.md Player/Penguin split with no schema ceremony.

**Flagged synergy (conditional on the realtime-backend decision):** if the parallel ticket selects **Supabase Realtime**, switch this recommendation to **Supabase Auth** instead — Supabase Auth + Supabase Realtime in a single project is the strongest platform-sharing combination of any pairing evaluated here, with Postgres RLS able to scope Presence/Session rows directly off `auth.uid()` with no custom token-verification glue. Similarly, if the team lands on **PartyKit**, note that **Clerk** ships an official, documented integration path for it.

## Sources

- [Firebase Pricing](https://firebase.google.com/pricing) — Spark plan MAU/Realtime Database/Firestore limits
- [Firebase Authentication docs](https://firebase.google.com/docs/auth)
- [Supabase Pricing](https://supabase.com/pricing) — Free plan MAU, OAuth, Realtime connection/message limits
- [Supabase Auth docs](https://supabase.com/docs/guides/auth)
- [Clerk Pricing](https://clerk.com/pricing) — Hobby plan MRU limit, social connections, enterprise SSO gating
- [Clerk user metadata docs](https://clerk.com/docs/users/metadata)
- [Auth.js homepage](https://authjs.dev) — OSS status, Better Auth Inc. ownership
- [Auth.js Google provider docs](https://authjs.dev/getting-started/providers/google)
- [Google Identity Services for Web overview](https://developers.google.com/identity/gsi/web/guides/overview)
- [Google — Verify the Google ID token on your server side](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Colyseus Room Authentication docs](https://docs.colyseus.io/auth/room) — JWT `onAuth()` pattern, provider-agnostic
- [PartyKit Authentication guide](https://docs.partykit.io/guides/authentication/) — documented Clerk JWT pairing
