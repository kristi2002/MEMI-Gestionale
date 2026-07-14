import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthMe } from '@/types';

interface AuthState {
  me: AuthMe | null;
  isLoading: boolean;
  isError: boolean;
  isAdmin: boolean;
  permissions: string[];
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.auth.me(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // The legacy admin hides ADMIN_ONLY sections from the 'staff' role only;
  // owners/admins (and the default single-admin, which reports no explicit
  // role) see everything. Mirror that: anyone who isn't 'staff' is an admin.
  const role = (data?.ruolo || data?.role || '').toLowerCase();
  const value: AuthState = {
    me: data ?? null,
    isLoading,
    isError,
    isAdmin: role !== 'staff',
    permissions: data?.permissions ?? [],
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
