/** How many columns a round's heats are laid out in on the Draw step: two heats to a column, between one and four columns (8 heats of 3 are two rows of four). */
export const heatColumns = (heats: number): number => Math.min(4, Math.max(1, Math.ceil(heats / 2)));
