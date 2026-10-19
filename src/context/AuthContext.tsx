import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isCloudActive } from '../lib/supabase';
import { Profile } from '../types';
import { getRandomProfileColor } from '../utils/colors';

interface AuthContextType {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  savedAccounts: Array<{ email: string; displayName: string; color: string; avatarUrl?: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<Array<{ email: string; displayName: string; color: string; avatarUrl?: string | null }>>([]);

  const refreshSavedAccounts = () => {
    try {
      const stored = localStorage.getItem('trip_known_accounts') || '[]';
      setSavedAccounts(JSON.parse(stored));
    } catch {
      setSavedAccounts([]);
    }
  };

  const recordSavedAccount = (email: string, displayName: string, color?: string, avatarUrl?: string | null) => {
    try {
      const stored = localStorage.getItem('trip_known_accounts') || '[]';
      let list: any[] = JSON.parse(stored);
      list = list.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
      list.unshift({
        email,
        displayName: displayName || email.split('@')[0],
        color: color || '#007AFF',
        avatarUrl: avatarUrl || null,
      });
      localStorage.setItem('trip_known_accounts', JSON.stringify(list.slice(0, 5)));
      setSavedAccounts(list.slice(0, 5));
    } catch {
      // Ignore
    }
  };

  const clearAuthSession = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
      // Ignore
    }
    setUser(null);
    setProfile(null);
    try {
      localStorage.removeItem('trip_local_user');
      localStorage.removeItem('trip_local_profile');
      localStorage.removeItem('active_trip_id');
      localStorage.removeItem('trip_sb_session');
    } catch {
      // Ignore
    }
  };

  async function fetchProfile(userId: string, email?: string) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile(data as Profile);
        recordSavedAccount(email || '', data.display_name, data.color, data.avatar_url);
      } else if (!error) {
        const fallbackColor = getRandomProfileColor();
        const fallbackName = email?.split('@')[0] || 'User';
        const newProf = {
          id: userId,
          display_name: fallbackName,
          color: fallbackColor,
          avatar_url: null,
        };
        const { error: upsertErr } = await supabase.from('profiles').upsert(newProf);
        if (!upsertErr) {
          setProfile(newProf);
          recordSavedAccount(email || '', fallbackName, fallbackColor, null);
        }
      }
    } catch (err) {
      console.warn('Failed to load profile:', err);
    }
  }

  useEffect(() => {
    let isMounted = true;
    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 1200);

    refreshSavedAccounts();

    async function initAuth() {
      try {
        if (isCloudActive && supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user && isMounted) {
            const u = { id: sessionData.session.user.id, email: sessionData.session.user.email };
            setUser(u);
            await fetchProfile(sessionData.session.user.id, sessionData.session.user.email);
          }

          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            if (event === 'SIGNED_OUT') {
              setUser(null);
              setProfile(null);
              setIsLoading(false);
              return;
            }
            if (session?.user) {
              const u = { id: session.user.id, email: session.user.email };
              setUser(u);
              await fetchProfile(session.user.id, session.user.email);
            }
            setIsLoading(false);
          });
          return () => subscription.unsubscribe();
        }
      } catch (err) {
        console.warn('Session init notice:', err);
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimer);
          setIsLoading(false);
        }
      }
    }

    initAuth();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) return { error: 'Please enter your email' };
    if (!cleanPassword) return { error: 'Please enter your password' };

    if (!isCloudActive || !supabase) {
      return {
        error: 'Database connection failed. Please verify that your project URL and API key are configured.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        if (error.message?.toLowerCase().includes('email not confirmed')) {
          return {
            error: 'Email is not confirmed yet. Turn off "Confirm email" in your Supabase Auth settings to log in instantly.',
          };
        }
        return { error: error.message };
      }

      if (data.user) {
        const cloudUser = { id: data.user.id, email: data.user.email };
        setUser(cloudUser);
        await fetchProfile(data.user.id, data.user.email);
        return {};
      }
      return { error: 'Failed to sign in. Please check your credentials.' };
    } catch (err: any) {
      return { error: err?.message || 'Error communicating with database.' };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0];

    if (!cleanEmail) return { error: 'Please enter an email' };
    if (!cleanPassword || cleanPassword.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    if (!isCloudActive || !supabase) {
      return {
        error: 'Database connection failed. Please verify that your project URL and API key are configured.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            display_name: cleanName,
          },
        },
      });

      if (error) {
        if (error.message?.toLowerCase().includes('user already registered')) {
          return signIn(cleanEmail, cleanPassword);
        }
        return { error: error.message };
      }

      if (data.user) {
        const color = getRandomProfileColor();
        const newProf = {
          id: data.user.id,
          display_name: cleanName,
          color,
          avatar_url: null,
        };

        await supabase.from('profiles').upsert(newProf);

        if (data.session) {
          const cloudUser = { id: data.user.id, email: data.user.email };
          setUser(cloudUser);
          setProfile(newProf);
          recordSavedAccount(cleanEmail, cleanName, color, null);
          return {};
        } else {
          // User was created in auth.users, but Supabase project has "Confirm email" enabled
          return {
            error: 'Account created! If email confirmation is enabled in your Supabase settings, please check your inbox or disable "Confirm email" under Auth -> Providers.',
          };
        }
      }
      return { error: 'Sign up could not be completed.' };
    } catch (err: any) {
      return { error: err?.message || 'Error signing up with database.' };
    }
  };

  const signOut = async () => {
    await clearAuthSession();
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user || !profile || !supabase) return;
    const updated = { ...profile, ...updates };
    setProfile(updated);

    try {
      await supabase.from('profiles').update(updates).eq('id', user.id);
      recordSavedAccount(user.email || '', updated.display_name, updated.color, updated.avatar_url);
    } catch (err) {
      console.warn('Failed to update profile:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        savedAccounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
