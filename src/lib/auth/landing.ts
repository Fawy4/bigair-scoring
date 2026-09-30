import { safeNext } from "./safe-next";

/** True when `next` is a safe in-app path somebody actually asked to go to (not just the default). */
export function hasExplicitNext(next: string | null | undefined): boolean {
  return Boolean(next) && safeNext(next, "") !== "";
}

/** Where to send a person right after sign-in: the page they were heading for, else /admin for platform admins, else /org. */
export function landingPath({ next, isPlatformAdmin }: { next: string | null | undefined; isPlatformAdmin: boolean }): string {
  if (hasExplicitNext(next)) return safeNext(next);
  return isPlatformAdmin ? "/admin" : "/org";
}
