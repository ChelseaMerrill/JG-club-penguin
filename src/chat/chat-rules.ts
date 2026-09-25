import { CHAT_TEXT_MAX } from '../contracts';

/**
 * Prepares raw HUD chat field input for sending (#44): normalizes newlines to
 * a space and trims, then cuts to `CHAT_TEXT_MAX` rather than rejecting an
 * overlong message outright (the field's own `maxlength` stops most of these
 * before they happen, but this guards a programmatic value or an IME commit
 * that bypasses it). Whitespace-only input is dropped: returns `null` rather
 * than sending an empty message.
 */
export function prepareChatSend(raw: string): string | null {
  const normalized = raw.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
  if (normalized.length === 0) return null;
  return normalized.length > CHAT_TEXT_MAX ? normalized.slice(0, CHAT_TEXT_MAX) : normalized;
}
