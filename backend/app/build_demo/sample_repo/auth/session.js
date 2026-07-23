// Session / auth logic. PROTECTED.
export function getSession(request) {
  const header = request && request.headers ? request.headers.authorization : null;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return { token: header.slice("Bearer ".length), valid: true };
}
