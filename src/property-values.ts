/**
 * Formats the values of a link property for writing: a plain string when it holds one value, a list when it holds several.
 *
 * @param values - The values to write.
 * @returns The single value, or a copy of the list.
 */
export function toPropertyValue(values: readonly string[]): string | string[] {
  const [first] = values;
  return values.length === 1 && first !== undefined ? first : [...values];
}
