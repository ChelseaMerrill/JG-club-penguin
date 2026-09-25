import { describe, expect, it } from 'vitest';
import {
  buildResendRequest,
  formatFeedbackEmail,
  isAuthorizedWebhook,
  parseFeedbackWebhook,
  type FeedbackRecord,
} from '../../supabase/functions/feedback-email/format.ts';

// The feedback-email Edge Function's logic (supabase/functions/feedback-email),
// kept in a pure module so it runs here under Vitest; index.ts is a thin Deno
// wrapper around it.

const record: FeedbackRecord = {
  id: '7d1f7c1e-0000-4000-8000-000000000001',
  player_id: '2a5e0b1c-0000-4000-8000-000000000002',
  kind: 'issue',
  message: 'The <b>door</b> in "The Melt" & the hallway is stuck',
  room_id: 'the-melt',
  client_info: '1600x900 Mozilla/5.0',
  created_at: '2026-09-25T15:04:05.000Z',
  emailed_at: null,
};

describe('isAuthorizedWebhook', () => {
  it('accepts the exact shared secret', () => {
    expect(isAuthorizedWebhook('s3cret-value', 's3cret-value')).toBe(true);
  });

  it.each([
    ['a wrong secret', 'wrong-value', 's3cret-value'],
    ['a secret that is only a prefix', 's3cret', 's3cret-value'],
    ['a missing header', null, 's3cret-value'],
    ['an unset secret, even with an empty header', '', undefined],
    ['an empty configured secret', '', ''],
  ])('rejects %s', (_label, header, secret) => {
    expect(isAuthorizedWebhook(header, secret)).toBe(false);
  });
});

describe('parseFeedbackWebhook', () => {
  it('returns the record of a public.feedback INSERT payload', () => {
    const payload = {
      type: 'INSERT',
      schema: 'public',
      table: 'feedback',
      record,
      old_record: null,
    };

    expect(parseFeedbackWebhook(payload)).toEqual(record);
  });

  it.each([
    ['an UPDATE', { type: 'UPDATE', schema: 'public', table: 'feedback', record }],
    ['another table', { type: 'INSERT', schema: 'public', table: 'players', record }],
    [
      'a record without a message',
      { type: 'INSERT', schema: 'public', table: 'feedback', record: { id: 'x' } },
    ],
    ['not an object', 'hello'],
    ['null', null],
  ])('rejects %s', (_label, payload) => {
    expect(parseFeedbackWebhook(payload)).toBeNull();
  });
});

describe('formatFeedbackEmail', () => {
  it('uses "[Club JenGuin] Issue report from <name>" for an issue', () => {
    const email = formatFeedbackEmail(record, { penguinName: 'WADDLES' });

    expect(email.subject).toBe('[Club JenGuin] Issue report from WADDLES');
  });

  it('uses "[Club JenGuin] Suggestion from <name>" for a suggestion', () => {
    const email = formatFeedbackEmail(
      { ...record, kind: 'suggestion' },
      { penguinName: 'WADDLES' },
    );

    expect(email.subject).toBe('[Club JenGuin] Suggestion from WADDLES');
  });

  it('falls back to "a Player" when the Penguin has no name', () => {
    expect(formatFeedbackEmail(record, { penguinName: null }).subject).toBe(
      '[Club JenGuin] Issue report from a Player',
    );
    expect(formatFeedbackEmail(record, { penguinName: '   ' }).subject).toBe(
      '[Club JenGuin] Issue report from a Player',
    );
  });

  it('keeps line breaks out of the subject', () => {
    const email = formatFeedbackEmail(record, {
      penguinName: 'EVIL\r\nBcc: someone@example.invalid',
    });

    expect(email.subject).toBe(
      '[Club JenGuin] Issue report from EVIL Bcc: someone@example.invalid',
    );
  });

  it('puts every field in the plain-text body, unescaped', () => {
    const { text } = formatFeedbackEmail(record, { penguinName: 'WADDLES' });

    expect(text).toContain('Kind: Issue report');
    expect(text).toContain('From: WADDLES (Player 2a5e0b1c-0000-4000-8000-000000000002)');
    expect(text).toContain('Room: the-melt');
    expect(text).toContain('Client: 1600x900 Mozilla/5.0');
    expect(text).toContain('Sent: 2026-09-25T15:04:05.000Z');
    expect(text).toContain('The <b>door</b> in "The Melt" & the hallway is stuck');
  });

  it('escapes the message and the name in the HTML body', () => {
    const { html } = formatFeedbackEmail(
      { ...record, room_id: '<script>', client_info: "it's" },
      { penguinName: '<img src=x>' },
    );

    expect(html).toContain(
      'The &lt;b&gt;door&lt;/b&gt; in &quot;The Melt&quot; &amp; the hallway is stuck',
    );
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('it&#39;s');
    expect(html).not.toContain('<b>door');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('shows missing Room and client info as "(none)"', () => {
    const { text } = formatFeedbackEmail(
      { ...record, room_id: null, client_info: null },
      {
        penguinName: 'WADDLES',
      },
    );

    expect(text).toContain('Room: (none)');
    expect(text).toContain('Client: (none)');
  });
});

describe('buildResendRequest', () => {
  it('POSTs the email to Resend with the API key as a bearer token', () => {
    const email = { subject: 'S', text: 'T', html: '<p>H</p>' };

    const request = buildResendRequest(email, {
      apiKey: 're_test_key',
      to: 'owner@example.invalid',
      from: 'onboarding@resend.dev',
    });

    expect(request.url).toBe('https://api.resend.com/emails');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toEqual({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(request.init.body)).toEqual({
      from: 'onboarding@resend.dev',
      to: ['owner@example.invalid'],
      subject: 'S',
      text: 'T',
      html: '<p>H</p>',
    });
  });
});
