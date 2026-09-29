const MESSAGES: Record<string, string> = {
  INVALID_PIN: "That event code or PIN is not recognised. Check the card you were given and try again.",
  INVALID_TOKEN: "This QR code has already been used or has expired. Ask the organiser for a new card, or type your PIN instead.",
  RATE_LIMITED: "Too many wrong tries. Wait ten minutes, or ask the organiser for help.",
  SEAT_LOCKED: "This seat is locked to another phone. Ask the organiser to unlock it.",
  NO_SESSION: "Your phone could not start a session. Check your connection and try again.",
  ORGANISER_SESSION: "This browser is signed in as an organiser. Use another browser or a private window to join as a judge or spotter.",
};

export function joinErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}
