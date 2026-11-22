// SRS-NFR-111: when a database or server call fails, its details (the
// database's message and code, table and constraint names) are logged here on
// the server, and the browser gets only a plain message for the player.
export function serverError(where: string, error: unknown, message: string, status = 500): Response {
  const detail =
    error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  console.error(`${where}:`, detail);
  return Response.json({ error: message }, { status });
}
