// feedback-email: emails each new in-game feedback submission to the owner.
//
// Invoked by a Supabase Database Webhook on INSERT into public.feedback (see
// README.md for setup). Runs on Supabase Edge Functions (Deno); this repo has
// no Deno toolchain, so this file is not type-checked by `npm run typecheck`
// (tsconfig includes only src/ and types/). Every piece of logic lives in
// ./format.ts, which is type-checked and unit-tested through
// src/feedback/feedback-email.test.ts.
//
// Secrets (never committed): FEEDBACK_WEBHOOK_SECRET, RESEND_API_KEY,
// FEEDBACK_TO_EMAIL, optional FEEDBACK_FROM_EMAIL. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the Edge Functions runtime.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  DEFAULT_FROM_EMAIL,
  buildResendRequest,
  formatFeedbackEmail,
  isAuthorizedWebhook,
  parseFeedbackWebhook,
} from './format.ts';

function respond(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // The shared secret is checked before anything else, including the method
  // and the body, so an unauthenticated caller learns nothing.
  if (
    !isAuthorizedWebhook(
      req.headers.get('x-webhook-secret'),
      Deno.env.get('FEEDBACK_WEBHOOK_SECRET'),
    )
  ) {
    return respond(401, 'unauthorized');
  }
  if (req.method !== 'POST') {
    return respond(405, 'method not allowed');
  }

  const record = parseFeedbackWebhook(await req.json().catch(() => null));
  if (!record) {
    return respond(400, 'not a public.feedback INSERT payload');
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('FEEDBACK_TO_EMAIL');
  const from = Deno.env.get('FEEDBACK_FROM_EMAIL') || DEFAULT_FROM_EMAIL;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !to || !supabaseUrl || !serviceRoleKey) {
    console.error('[feedback-email] missing configuration');
    return respond(500, 'not configured');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Best effort: the Penguin's name makes the subject readable, but an email
  // without it is still worth sending.
  let penguinName: string | null = null;
  if (record.player_id) {
    const { data } = await supabase
      .from('players')
      .select('penguin_name')
      .eq('id', record.player_id)
      .maybeSingle();
    penguinName = typeof data?.penguin_name === 'string' ? data.penguin_name : null;
  }

  const email = formatFeedbackEmail(record, { penguinName });
  const { url, init } = buildResendRequest(email, { apiKey, to, from });
  const sent = await fetch(url, init);
  if (!sent.ok) {
    console.error('[feedback-email] Resend refused the email', sent.status, await sent.text());
    return respond(502, 'email not sent');
  }

  const { error } = await supabase
    .from('feedback')
    .update({ emailed_at: new Date().toISOString() })
    .eq('id', record.id);
  if (error) {
    // The email already went out; report it without failing the webhook
    // (a retry would send a duplicate email).
    console.error('[feedback-email] could not set emailed_at', error.message);
  }

  return respond(200, 'sent');
});
