import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

export function isServerConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey && serviceRoleKey);
}

export function createSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token || undefined;
}

export async function getAuthenticatedUser(accessToken: string): Promise<AuthenticatedUser | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? (user as AuthenticatedUser) : null;
}

/**
 * Resolves the user id for an API request from a verified access token.
 * Returns null if no token was provided or it doesn't correspond to a
 * valid session.
 */
export async function resolveTargetUserId(accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const user = await getAuthenticatedUser(accessToken);
  return user?.id ?? null;
}
