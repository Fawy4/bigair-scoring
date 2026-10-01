/** The judge whose score is farthest from the middle score of the panel: the one the console marks as the outlier. */
export function farthestJudge(scores: Array<{ judgeId: string; score: number }>): string | null {
  if (scores.length === 0) return null;
  const sorted = scores.map((s) => s.score).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return [...scores].sort((a, b) => Math.abs(b.score - median) - Math.abs(a.score - median))[0].judgeId;
}
