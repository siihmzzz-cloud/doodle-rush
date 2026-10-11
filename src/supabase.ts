import { createClient } from '@supabase/supabase-js';

export type Cosmetic = {
  id: string;
  name: string;
  slot: 'background' | 'pen' | 'avatar_border';
  price: number;
  description: string;
  preview: string | null;
};

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
