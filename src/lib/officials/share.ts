import { copy } from "@/lib/ui-copy";

export function joinAddress(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/e/${slug}/join`;
}

export function shareText(input: { eventName: string; seatName: string; joinUrl: string; pin: string }): string {
  return copy.officials.shareMessage(input.eventName, input.seatName, input.joinUrl, input.pin);
}

/** A WhatsApp link that opens with the message ready to send. */
export function shareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
