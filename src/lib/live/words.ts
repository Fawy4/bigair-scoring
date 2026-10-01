/** A colour word reads "Red" in a sentence, whether it is stored as "red" or shown as "RED"; a name stays as it is. */
export const softWord = (t: string): string => (/^[A-Za-z]+$/.test(t) ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t);
