export function isAuthorizationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; status?: number; name?: string };
  return (
    value.code === "42501" ||
    value.code === "PGRST301" ||
    value.code === "PGRST302" ||
    value.status === 401 ||
    value.status === 403 ||
    value.name === "AuthSessionMissingError"
  );
}

export function requireRead<T>(
  data: T | null,
  error: unknown,
): asserts data is T {
  if (error) throw error;
  if (data === null) throw new Error("Read returned no result.");
}
