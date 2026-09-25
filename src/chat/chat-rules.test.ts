import { describe, expect, it } from 'vitest';
import { CHAT_TEXT_MAX } from '../contracts';
import { prepareChatSend } from './chat-rules';

describe('prepareChatSend', () => {
  it('cuts a 121-character message to 120', () => {
    const raw = 'a'.repeat(CHAT_TEXT_MAX + 1);

    const result = prepareChatSend(raw);

    expect(result).toHaveLength(CHAT_TEXT_MAX);
    expect(result).toBe('a'.repeat(CHAT_TEXT_MAX));
  });

  it('passes a message at exactly the limit through unchanged', () => {
    const raw = 'b'.repeat(CHAT_TEXT_MAX);

    expect(prepareChatSend(raw)).toBe(raw);
  });

  it('drops whitespace-only input', () => {
    expect(prepareChatSend('   ')).toBeNull();
    expect(prepareChatSend('\n\t  \n')).toBeNull();
    expect(prepareChatSend('')).toBeNull();
  });

  it('trims surrounding whitespace and collapses newlines to a space', () => {
    expect(prepareChatSend('  hello  ')).toBe('hello');
    expect(prepareChatSend('line one\nline two')).toBe('line one line two');
    expect(prepareChatSend('line one\r\nline two')).toBe('line one line two');
  });

  it('renders <script> as a literal string rather than stripping or escaping it', () => {
    const raw = '<script>window.__pwned=1</script>';

    expect(prepareChatSend(raw)).toBe(raw);
  });
});
