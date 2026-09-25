# feedback-email

Emails every in-game feedback submission (the HUD's feedback button) to the
owner. A Supabase Database Webhook on `INSERT` into `public.feedback` calls
this Edge Function; it checks a shared secret header, formats a plain-text and
HTML email, sends it through [Resend](https://resend.com)'s HTTP API, then
sets the row's `emailed_at`.

- `index.ts` is the Deno entry point (a thin wrapper).
- `format.ts` holds all the logic and is unit-tested by Vitest
  (`src/feedback/feedback-email.test.ts`).
- The destination address lives only in the `FEEDBACK_TO_EMAIL` secret. Never
  put it, or any secret value, in this repo.

## One-time setup (human steps)

You need the Supabase CLI (`npx supabase ...` works), logged in and linked to
the project: `supabase login`, then `supabase link --project-ref <project-ref>`.

1. **Apply the migration.** Paste
   `supabase/migrations/20260925020000_feedback.sql` into the Supabase SQL
   editor and run it (safe to rerun). Optionally prove it: paste
   `supabase/tests/feedback_proof.sql`, replace the fixture id as its header
   says, and check every row (including `ALL`) shows `pass = true`.

2. **Create a Resend API key.** Sign up at <https://resend.com>, then API Keys
   → Create API Key (permission "Sending access" is enough). Copy it once; it
   isn't shown again.
   - With the default sender `onboarding@resend.dev`, Resend delivers **only to
     the email address that owns the Resend account**. So either create the
     Resend account with the address that should receive feedback, or verify a
     domain in Resend (Domains → Add Domain) and set `FEEDBACK_FROM_EMAIL` to
     an address on it (for example `feedback@<your-domain>`).

3. **Choose a webhook secret**: a long random string, e.g. the output of
   `openssl rand -hex 32`. It is used in steps 4 and 6.

4. **Set the function's secrets** (replace every `<...>`; don't commit them):

   ```sh
   supabase secrets set \
     RESEND_API_KEY=<resend-api-key> \
     FEEDBACK_TO_EMAIL=<destination-address> \
     FEEDBACK_WEBHOOK_SECRET=<webhook-secret>
   # Only if you verified a domain in step 2:
   supabase secrets set FEEDBACK_FROM_EMAIL=<sender-address-on-that-domain>
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge
   Functions automatically.

5. **Deploy the function**:

   ```sh
   supabase functions deploy feedback-email --no-verify-jwt
   ```

   `--no-verify-jwt` because the webhook authenticates with the
   `x-webhook-secret` header instead of a Supabase JWT; the function rejects
   any request without the right secret (401) before reading its body. (If you
   prefer to keep JWT verification on, deploy without the flag and also add an
   `Authorization: Bearer <service-role-key>` header in step 6.)

6. **Create the Database Webhook.** Dashboard → Database → Webhooks → Create a
   new hook:
   - Name: `feedback-email`
   - Table: `public.feedback`
   - Events: `Insert` only
   - Type: HTTP Request, method `POST`
   - URL: `https://<project-ref>.supabase.co/functions/v1/feedback-email`
   - HTTP headers: `Content-Type: application/json` and
     `x-webhook-secret: <webhook-secret>` (the same value as step 4)

7. **Try it.** Sign in to the game, click the feedback button (bottom right,
   above QUESTS/IGLOO), send a message, and check the inbox. In the SQL
   editor, `select id, kind, created_at, emailed_at from public.feedback order
   by created_at desc limit 5;` shows `emailed_at` set once the email went
   out. If it stays null, check Edge Functions → feedback-email → Logs.

## Behaviour notes

- A wrong or missing `x-webhook-secret` gets 401; a payload that isn't a
  `public.feedback` INSERT gets 400; missing secrets get 500; a Resend failure
  gets 502 (the webhook may retry; `emailed_at` stays null).
- Players are rate-limited by the database (5 submissions per 10 minutes), so
  the inbox gets at most 30 emails per Player per hour.
- Rotating the webhook secret: set the new value with `supabase secrets set`,
  then update the webhook's header to match.
