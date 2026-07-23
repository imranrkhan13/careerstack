// Backend API handler. PROTECTED — marketing/landing changes must never touch this.
import { getSession } from "../../auth/session.js";
import { findUsers } from "../../db/schema.js";

export async function GET(request) {
  const session = getSession(request);
  if (!session) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  return { status: 200, body: { users: findUsers() } };
}
