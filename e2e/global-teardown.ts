import { purgeThisRun } from "./cleanup";

/** Runs after the last test whether the suite passed or failed. */
export default async function globalTeardown() {
  await purgeThisRun();
}
