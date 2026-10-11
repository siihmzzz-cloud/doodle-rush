import { createClient } from '@supabase/supabase-js';

export type Cosmetic = {
  id: string;
  name: string;
  slot: 'background' | 'pen' | 'avatar_border';
  price: number;
  description: string;
  preview: string | null;
};

// These are public Supabase browser credentials (anon role); RLS remains the security boundary.
const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const url = (configuredUrl || "https://nshzhmjkornpgjxxrpyu.supabase.co").replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const anonKey = configuredAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zaHpobWprb3JucGdqeHhycHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDc4NjIsImV4cCI6MjEwNzMyMzg2Mn0.qxKCRq0-Gxj0H5Mkf97aeMbAqAD9Eklpo8ORcFsumY4";

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
