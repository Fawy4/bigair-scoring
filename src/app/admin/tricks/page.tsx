import { redirect } from "next/navigation";

/** The proposals now sit at the top of Master presets → Trick base; this address keeps working. */
export default function TrickProposalsPage() {
  redirect("/admin/presets/trick-base#proposals");
}
