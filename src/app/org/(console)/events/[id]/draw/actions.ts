"use server";

import { z } from "zod";
import { DrawError, edit, generate, lock, unlock, type EditOutcome, type GenerateResult } from "@/lib/draw/server";
import type { DrawEdit } from "@/lib/engine/ladder";
import { reasonOf } from "@/lib/reason";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

const T = copy.draw.errors;

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const Uuid = z.string().uuid();
const Seat = z.object({ heatId: z.string().min(1).max(40), slot: z.number().int().min(0).max(9) });
const Source = z.object({ round: z.string().min(1).max(40), heat: z.number().int().min(0).max(99), place: z.number().int().min(1).max(10) });

// what the browser may ask for; the engine validates the rest
const EditSchema: z.ZodType<DrawEdit> = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), from: Seat, to: Seat }),
  z.object({ op: z.literal("place"), heatId: z.string().min(1).max(40), slot: z.number().int().min(0).max(9), entrantId: Uuid }),
  z.object({ op: z.literal("setPlace"), heatId: z.string().min(1).max(40), slot: z.number().int().min(0).max(9), from: Source }),
  z.object({ op: z.literal("clear"), heatId: z.string().min(1).max(40), slot: z.number().int().min(0).max(9) }),
  z.object({ op: z.literal("addSeat"), heatId: z.string().min(1).max(40) }),
  z.object({ op: z.literal("removeSeat"), heatId: z.string().min(1).max(40), slot: z.number().int().min(0).max(9) }),
  z.object({ op: z.literal("addHeat"), roundId: z.string().min(1).max(40) }),
  z.object({ op: z.literal("removeHeat"), heatId: z.string().min(1).max(40) }),
  z.object({ op: z.literal("addRound"), afterRoundId: z.string().min(1).max(40).optional(), name: z.string().max(40).optional() }),
  z.object({ op: z.literal("removeRound"), roundId: z.string().min(1).max(40) }),
  z.object({ op: z.literal("renameRound"), roundId: z.string().min(1).max(40), name: z.string().max(40) }),
  z.object({ op: z.literal("renameHeat"), heatId: z.string().min(1).max(40), name: z.string().max(40) }),
]) as z.ZodType<DrawEdit>;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function message(e: unknown): string {
  if (e instanceof DrawError) {
    switch (e.code) {
      case "locked":
        return T.locked;
      case "started":
        return T.started;
      case "not_allowed":
        return T.notAllowed;
      case "no_format":
        return T.noFormat;
      case "no_riders":
        return T.noRiders;
      case "no_draw":
        return T.noDraw;
      case "reason":
        return T.failed;
      case "bad_format":
        return T.badFormat(e.message);
      default:
        // an edit the engine refused already carries a plain sentence; database text does not
        return /^[A-Z_]+$/.test(e.message) || /violates|constraint|function|relation/i.test(e.message) ? T.failed : e.message;
    }
  }
  return T.failed;
}

/** "Generate draw" and "Regenerate": one confirmation in the screen; refused once any heat has started or while the draw is locked. */
export async function generateDraw(divisionId: string, keepArranged: boolean): Promise<Result<GenerateResult>> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.failed);
  try {
    return { ok: true, ...(await generate(await createClient(), divisionId, { keepArranged })) };
  } catch (e) {
    return fail(message(e));
  }
}

/** One hand change (move, swap, place, clear, add or take out a heat, rename …), saved and audited at once. */
export async function editDraw(divisionId: string, e: unknown): Promise<Result<EditOutcome>> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.failed);
  const parsed = EditSchema.safeParse(e);
  if (!parsed.success) return fail(T.failed);
  try {
    return { ok: true, ...(await edit(await createClient(), divisionId, parsed.data)) };
  } catch (err) {
    return fail(message(err));
  }
}

export async function lockDraw(divisionId: string): Promise<Result> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.failed);
  try {
    await lock(await createClient(), divisionId);
    return { ok: true };
  } catch (e) {
    return fail(message(e));
  }
}

/** Unlocking is audited with who and why; the reason is optional ("no reason given" when the box is empty). */
export async function unlockDraw(divisionId: string, reason: string): Promise<Result> {
  if (!Uuid.safeParse(divisionId).success) return fail(T.failed);
  const text = reasonOf(reason);
  try {
    await unlock(await createClient(), divisionId, text.slice(0, 500));
    return { ok: true };
  } catch (e) {
    return fail(message(e));
  }
}
