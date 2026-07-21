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

  // Mirror the backend's resolvePermissions() exactly (MEMI-Backend/src/permissions.js):
  // a FULL admin is signalled by `permissions === null`; any array (even empty) is a
  // scoped account. The old `role !== 'staff'` check granted full access on a missing/
  // unknown role — an auth-bypass. We now trust the resolved permissions the server sent.
  const role = (data?.ruolo || data?.role || '').toLowerCase();
  const rawPerms = data?.permissions;                 // string[] | null (null = full admin) | undefined (loading)
  const isFullAdmin = !!data && (rawPerms === null || role === 'admin');
  const value: AuthState = {
    me: data ?? null,
    isLoading,
    isError,
    isAdmin: isFullAdmin,
    permissions: Array.isArray(rawPerms) ? rawPerms : [],
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
