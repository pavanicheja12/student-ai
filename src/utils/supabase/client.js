/// <reference types="vite/client" />

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publicKeyCandidates = [
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
].filter(Boolean);

function isPlaceholderKey(key) {
  return /^(YOUR_|replace[-_]|<)/i.test(key.trim());
}

const supabaseKey =
  publicKeyCandidates.find((key) => !isPlaceholderKey(key)) ||
  publicKeyCandidates[0];

function getConfigurationError() {
  if (!supabaseUrl?.trim()) {
    return "VITE_SUPABASE_URL is missing from .env.local.";
  }
  if (!supabaseKey?.trim()) {
    return "Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in .env.local.";
  }
  if (isPlaceholderKey(supabaseKey)) {
    return "The Supabase public key still contains a placeholder. Add the project's publishable or anon key.";
  }

  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      return "VITE_SUPABASE_URL must use HTTPS.";
    }
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }

  if (
    supabaseKey.trim().startsWith("sb_secret_") ||
    getJwtRole(supabaseKey) === "service_role"
  ) {
    return "A Supabase secret key cannot be used in a browser app. Use the project's public publishable key.";
  }

  return "";
}

function getJwtRole(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return "";
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role || "";
  } catch {
    return "";
  }
}

export const supabaseConfigurationError = getConfigurationError();
export const isSupabaseConfigured = !supabaseConfigurationError;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;