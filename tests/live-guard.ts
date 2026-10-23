/**
 * The hosted database is the live one and has no backups. Until a separate test database exists, a test that removes rows on purpose, or writes to a table real organisers
 * or the owner see, stays OFF unless the person running it asks for it with one of these two flags:
 *
 *   TESTS_MAY_DELETE=1         tests whose point is to delete or reset something (Delete event, Delete organisation, Reset, Restore, delete a preset, delete a simulation,
 *                              remove an organiser) and tests that delete a row of their own test organisation to set up or end a scenario
 *   TESTS_MAY_WRITE_SHARED=1   tests that write system presets, the default preset, master trick base versions, platform settings, release ticks or the owner's feedback notes
 *
 * Some tests need both (they say so in src/lib/platform/test-hygiene.test.ts, which keeps the list). Normal runs leave both flags off.
 * Not covered by the flags: a function that clears or replaces the working rows of the very scenario it runs in (regenerating a draw, clearing a score line, a simulator log
 * trimming itself); those touch nothing but rows the same test created minutes earlier.
 */
export const MAY_DELETE = process.env.TESTS_MAY_DELETE === "1";
export const MAY_WRITE_SHARED = process.env.TESTS_MAY_WRITE_SHARED === "1";

export const OFF_UNLESS_DELETE = !MAY_DELETE;
export const OFF_UNLESS_SHARED = !MAY_WRITE_SHARED;
export const OFF_UNLESS_BOTH = !MAY_DELETE || !MAY_WRITE_SHARED;
