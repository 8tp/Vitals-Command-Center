/**
 * The user's personal health context, injected into AI prompts (brief, ask, MCP
 * instructions). Kept OUT of source — set `USER_PROFILE` in your .env so the repo
 * contains no personal data. Falls back to a generic instruction when unset.
 */
export function getUserProfile(): string {
  const p = process.env.USER_PROFILE?.trim();
  return (
    p ||
    'No personal profile configured. (Set USER_PROFILE in .env to personalize — e.g. goals, training, diet, supplements, allergies, constraints.) Until then, give general, sensible, non-personalized guidance.'
  );
}
