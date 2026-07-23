// Database schema + access. PROTECTED.
export const tables = {
  users: ["id", "email", "created_at"],
  sessions: ["id", "user_id", "expires_at"],
};

export function findUsers() {
  // Placeholder in the demo repo; real implementation queries the database.
  return [];
}
