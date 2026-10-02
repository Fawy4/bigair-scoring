/** What a visitor typed in "Have an event code?" as the event's page, or null when it cannot be a code. A code is the web address ending of the event: letters, digits and hyphens. */
export function eventCodeToPath(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  const marker = /(?:^|\/)e\/([^/?#\s]+)/.exec(text);
  if (marker) text = marker[1];
  else if (/[/\\?#:]/.test(text)) return null;
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(text) ? `/e/${text}` : null;
}
