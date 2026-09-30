import { copy } from "@/lib/ui-copy";

export function joinErrorMessage(code: string): string {
  return copy.join.errors[code] ?? copy.join.otherError;
}
