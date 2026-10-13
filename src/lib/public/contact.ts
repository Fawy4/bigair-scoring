/** The "Get in touch on WhatsApp" address: digits only from the number (spaces, + and dashes dropped), the message URL-encoded; null when there is no usable number. */
export function whatsappLink(number: string | undefined, message: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}
