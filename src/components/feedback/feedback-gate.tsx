"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const FeedbackButton = dynamic(() => import("./feedback-button").then((m) => m.FeedbackButton), { ssr: false });

const PUBLIC = /^\/((e|o|screen)(\/|$)|$)/; // the public pages and the home page
/** The big screens (/screen/…) are for a TV or a projector: a clean screen, never a Note button, whoever is signed in on that browser. */
const SCREEN = /^\/screen(\/|$)/;

/**
 * Keeps the public site light: the Note button's code (and the login library behind it) is fetched on the public pages only when the browser holds a login
 * cookie, that is, for a signed-in organiser or owner. A visitor never downloads it. Everywhere else it loads as before.
 */
export function FeedbackGate() {
  const path = usePathname();
  const isPublic = PUBLIC.test(path);
  const [load, setLoad] = useState(!isPublic);
  useEffect(() => {
    setLoad(!isPublic || /(^|;\s*)sb-[^=]*-auth-token/.test(document.cookie));
  }, [isPublic, path]);
  return load && !SCREEN.test(path) ? <FeedbackButton /> : null;
}
