/** Integers from start (inclusive) to end (exclusive). */
export function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let value = start; value < end; value += 1) {
    result.push(value);
  }
  return result;
}
