/** The jump arc of the brand brief, drawn as an SVG (no photo): a thick round-ended arc, a thick rider dot at its top and a ground line. The arc takes the accent; the rest is the text colour. */
export function JumpArc() {
  return (
    <svg className="home-arc" viewBox="0 0 640 300" role="img" aria-label="" aria-hidden="true" focusable="false">
      <path className="arc" d="M32 268 Q 320 -96 608 268" fill="none" strokeWidth="18" strokeLinecap="round" />
      <circle cx="320" cy="86" r="16" fill="currentColor" />
      <path d="M32 284 H608" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
