// Pure logic for the feedback-email Edge Function: the webhook secret check,
// payload parsing, email formatting and the Resend request. No Deno or
// network APIs here, so Vitest runs it (src/feedback/feedback-email.test.ts)
// and index.ts stays a thin wrapper.

/** A public.feedback row as a Database Webhook sends it (20260925010000_feedback.sql). */
export interface FeedbackRecord {
  id: string;
  player_id: string | null;
  kind: 'issue' | 'suggestion';
  message: string;
  room_id: string | null;
  client_info: string | null;
  created_at: string;
  emailed_at: string | null;
}

export interface FeedbackEmail {
  subject: string;
  text: string;
  html: string;
}

export interface ResendConfig {
  apiKey: string;
  to: string;
  from: string;
}

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const DEFAULT_FROM_EMAIL = 'onboarding@resend.dev';

const KIND_LABELS: Record<FeedbackRecord['kind'], string> = {
  issue: 'Issue report',
  suggestion: 'Suggestion',
};

/**
 * True only when a secret is configured and `header` equals it exactly.
 * Compares every character (no early exit on the first mismatch) so the
 * response time doesn't reveal how much of a guess was right.
 */
export function isAuthorizedWebhook(header: string | null, secret: string | undefined): boolean {
  if (!secret || header === null) return false;
  let diff = header.length ^ secret.length;
  for (let i = 0; i < secret.length; i += 1) {
    diff |= (header.charCodeAt(i) || 0) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): value is string | null {
  return value === null || value === undefined || typeof value === 'string';
}

/** The inserted row of a public.feedback INSERT webhook payload, or `null` for anything else. */
export function parseFeedbackWebhook(payload: unknown): FeedbackRecord | null {
  if (!isObject(payload)) return null;
  if (payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'feedback') {
    return null;
  }
  const record = payload.record;
  if (!isObject(record)) return null;
  if (typeof record.id !== 'string' || typeof record.message !== 'string') return null;
  if (record.kind !== 'issue' && record.kind !== 'suggestion') return null;
  if (typeof record.created_at !== 'string') return null;
  if (
    !optionalString(record.player_id) ||
    !optionalString(record.room_id) ||
    !optionalString(record.client_info) ||
    !optionalString(record.emailed_at)
  ) {
    return null;
  }
  return {
    id: record.id,
    player_id: record.player_id ?? null,
    kind: record.kind,
    message: record.message,
    room_id: record.room_id ?? null,
    client_info: record.client_info ?? null,
    created_at: record.created_at,
    emailed_at: record.emailed_at ?? null,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapses CR/LF (and other whitespace runs) so a name can't add email headers. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function formatFeedbackEmail(
  record: FeedbackRecord,
  context: { penguinName: string | null },
): FeedbackEmail {
  const kindLabel = KIND_LABELS[record.kind];
  const name = singleLine(context.penguinName ?? '') || 'a Player';
  const from = record.player_id ? `${name} (Player ${record.player_id})` : name;
  const room = record.room_id ?? '(none)';
  const client = record.client_info ?? '(none)';

  const subject = `[Club JenGuin] ${kindLabel} from ${name}`;

  const text = [
    `Kind: ${kindLabel}`,
    `From: ${from}`,
    `Room: ${room}`,
    `Client: ${client}`,
    `Sent: ${record.created_at}`,
    `Feedback id: ${record.id}`,
    '',
    record.message,
    '',
  ].join('\n');

  const rows: Array<[string, string]> = [
    ['Kind', kindLabel],
    ['From', from],
    ['Room', room],
    ['Client', client],
    ['Sent', record.created_at],
    ['Feedback id', record.id],
  ];
  const html = [
    `<h2>${escapeHtml(`Club JenGuin: ${kindLabel}`)}</h2>`,
    '<table cellpadding="4">',
    ...rows.map(
      ([label, value]) => `<tr><th align="left">${label}</th><td>${escapeHtml(value)}</td></tr>`,
    ),
    '</table>',
    `<pre style="white-space: pre-wrap; font-family: inherit">${escapeHtml(record.message)}</pre>`,
  ].join('\n');

  return { subject, text, html };
}

export function buildResendRequest(
  email: FeedbackEmail,
  config: ResendConfig,
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  return {
    url: RESEND_EMAILS_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    },
  };
}
