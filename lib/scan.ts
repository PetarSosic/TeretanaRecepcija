/**
 * BR-070: the scanner types the card digits and Enter. The input is trimmed, and only
 * exactly ten digits count as a code; everything else is "Neispravan kod kartice."
 * Whether the code exists, and in which state, is for the database to say.
 */
export function parseCardCode(input: string): string | null {
  const value = input.trim();
  return /^[0-9]{10}$/.test(value) ? value : null;
}
