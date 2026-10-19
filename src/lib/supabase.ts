import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read statically from Vite environment
const envUrl = (import.meta.env.VITE_SUPABASE_URL || '') as string;
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

// Optional storage fallback
let storedUrl = '';
let storedKey = '';
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    storedUrl = localStorage.getItem('trip_supabase_url') || '';
    storedKey = localStorage.getItem('trip_supabase_anon_key') || '';
  }
} catch {
  // Ignore
}

const defaultUrl = 'https://ujjxhhjthwjmmgrbqkur.supabase.co';
const defaultAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqanhoaGp0aHdqbW1ncmJxa3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTA3MTgsImV4cCI6MjEwNzkyNjcxOH0.HyKOa6Y6CeVYig1X7bK798BDf241aRuo41dkiM0ygJA';

export const supabaseUrl = (envUrl || storedUrl || defaultUrl).trim();
export const supabaseAnonKey = (envKey || storedKey || defaultAnonKey).trim();

export const isCloudSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon-key')
);

let realClient: SupabaseClient | null = null;

if (isCloudSupabaseConfigured) {
  try {
    realClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'trip_sb_session',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
  }
}

export const supabase = realClient;
export const isCloudActive = Boolean(realClient);

// Storage helper for uploading images (avatars, chat attachments)
export async function uploadAsset(file: File | Blob, folder = 'chat'): Promise<string> {
  if (realClient) {
    try {
      const ext = ('name' in file ? (file as File).name.split('.').pop() : 'jpg') || 'jpg';
      const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const { error: uploadError } = await realClient.storage
        .from('trip-assets')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.warn('Storage upload error, falling back to data URL:', uploadError);
      } else {
        const { data } = realClient.storage.from('trip-assets').getPublicUrl(filePath);
        return data.publicUrl;
      }
    } catch (e) {
      console.warn('Storage error:', e);
    }
  }

  // Fallback: convert to base64 Data URL for preview
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
