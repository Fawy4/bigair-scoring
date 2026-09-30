import { randomBytes } from "node:crypto";
import { sweepStale } from "./cleanup";

export default async function globalSetup() {
  // one id per run, inherited by the worker processes, names this run's ledger
  process.env.E2E_RUN_ID = randomBytes(4).toString("hex");
  await sweepStale();
}
