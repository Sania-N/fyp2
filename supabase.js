import 'react-native-url-polyfill/auto';
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from '@env';

const DEFAULT_SUPABASE_URL = 'https://edqvveaohhszsiftifyq.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkcXZ2ZWFvaGhzenNpZnRpZnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDM0MzgsImV4cCI6MjA4MDAxOTQzOH0.cUJUkY5mfQeQWofM0yqhJhxWJuuE4XermGCloxppAOA';

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (
        normalized.length > 0 &&
        normalized.toLowerCase() !== 'undefined' &&
        normalized.toLowerCase() !== 'null'
      ) {
        return normalized;
      }
    }
  }
  return undefined;
};

const supabaseUrl = pickFirstValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_URL,
  DEFAULT_SUPABASE_URL
);
const supabaseKey = pickFirstValue(
  process.env.EXPO_PUBLIC_SUPABASE_KEY,
  SUPABASE_KEY,
  DEFAULT_SUPABASE_KEY
);

if (!supabaseUrl || !supabaseKey) {
  console.error('[Supabase] Missing SUPABASE_URL or SUPABASE_KEY. Recording uploads will be disabled.');
} else {
  console.log('[Supabase] Config ready:', {
    url: supabaseUrl,
    hasKey: Boolean(supabaseKey),
  });
}

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export { supabaseUrl, supabaseKey };
