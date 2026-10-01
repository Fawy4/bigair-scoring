"use server";

import { z } from "zod";
import { parseError } from "./errors";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

export type WindResult = { ok: true } | { ok: false; message: string };

const Input = z.object({ eventId: z.string().uuid(), status: z.enum(["red", "amber", "green", "clear"]), message: z.string().max(300).nullable().optional() });

/** The wind call of an event, set by the head judge or an organiser (the database checks who). Shows on the public pages and the big screen. */
export async function setWindCall(input: z.infer<typeof Input>): Promise<WindResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: copy.windCall.errors.BAD_WIND_STATUS };
  const db = await createClient();
  const { error } = await db.rpc("set_wind_call", { p_event: parsed.data.eventId, p_status: parsed.data.status, p_message: (parsed.data.message ?? null) as never });
  if (error) {
    const { code } = parseError(error.message);
    return { ok: false, message: (code && copy.windCall.errors[code]) || copy.liveErrors.unknown };
  }
  return { ok: true };
}
