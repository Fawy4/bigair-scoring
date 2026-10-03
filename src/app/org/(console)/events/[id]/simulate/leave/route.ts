import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * "I am leaving": the beacon a View-as tab sends when it closes (Polish 2, item 2). The database marks this login's View-as seat of the event; the simulator's
 * next tick gives it back unless the tab beats again within a few seconds (a reload). Anyone else's call changes nothing.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 204 });
  const db = await createClient();
  await db.rpc("sim_view_leave", { p_event: id });
  return new NextResponse(null, { status: 204 });
}
