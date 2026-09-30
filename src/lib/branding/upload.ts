"use client";

import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";
import { brandingPath, imageProblem } from "./image";

/** Uploads a logo into the organisation's folder and returns its public address. Throws a readable Error. */
export async function uploadBrandingImage(orgId: string, purpose: string, file: File): Promise<string> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const supabase = createClient();
  const path = brandingPath(orgId, purpose, file.type);
  const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(copy.logo.uploadFailed);
  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}
