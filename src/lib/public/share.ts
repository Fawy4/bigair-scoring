/** A WhatsApp link that opens the share sheet with a text and the page's address. */
export const whatsappLink = (text: string, url: string): string => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

/** The event's public address on a given site origin. */
export const eventUrl = (origin: string, slug: string, path = ""): string => `${origin.replace(/\/$/, "")}/e/${slug}${path}`;
