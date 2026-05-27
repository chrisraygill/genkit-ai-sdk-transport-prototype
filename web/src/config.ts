export const API_BASE =
  (import.meta.env.VITE_GENKIT_URL as string | undefined) ??
  'http://localhost:3400';
