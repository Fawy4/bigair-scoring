import { OrgChrome } from "../org-chrome";

/** Events list, organisation settings, feedback, password and new event: the top bar and a short list of places, no event open. */
export default function PlainLayout({ children }: { children: React.ReactNode }) {
  return <OrgChrome>{children}</OrgChrome>;
}
