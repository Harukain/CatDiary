import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  authApi,
  configureAuthSessionRuntime,
  type AuthSession,
  type FamilySummary,
} from './auth-api';
import {
  clearAuthSession,
  getRefreshToken,
  getSessionSnapshot,
  saveAuthSession,
} from './session-store';
import { clearSensitiveLocalData, maintainSensitiveLocalData } from '../local-data/cleanup';
import { canRestoreCachedSession } from './session-policy';

interface SessionContextValue {
  restoring: boolean;
  session: AuthSession | null;
  activeFamily: FamilySummary | null;
  signIn(session: AuthSession): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(): Promise<{ revokedCount: number }>;
  addFamily(family: FamilySummary): void;
  selectFamily(family: FamilySummary): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [restoring, setRestoring] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeFamily, setActiveFamily] = useState<FamilySummary | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [refreshToken, snapshot] = await Promise.all([
          getRefreshToken(),
          getSessionSnapshot(),
          maintainSensitiveLocalData().catch(() => undefined),
        ]);
        if (!refreshToken) {
          await Promise.all([clearAuthSession(), clearSensitiveLocalData()]);
          return;
        }
        try {
          const restored = await authApi.refresh(refreshToken);
          await saveAuthSession(restored);
          setSession(restored);
          setActiveFamily(restored.families[0] ?? null);
        } catch (error) {
          if (canRestoreCachedSession(error, refreshToken, snapshot)) {
            setSession(snapshot);
            setActiveFamily(snapshot.families[0] ?? null);
          } else {
            await Promise.all([clearAuthSession(), clearSensitiveLocalData()]);
          }
        }
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  useEffect(
    () =>
      configureAuthSessionRuntime({
        onRefreshed(nextSession) {
          void saveAuthSession(nextSession);
          setSession(nextSession);
          setActiveFamily(
            (current) =>
              nextSession.families.find((family) => family.id === current?.id) ??
              nextSession.families[0] ??
              null,
          );
        },
        onExpired() {
          void clearSensitiveLocalData();
          setSession(null);
          setActiveFamily(null);
        },
      }),
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      restoring,
      session,
      activeFamily,
      async signIn(nextSession) {
        await saveAuthSession(nextSession);
        setSession(nextSession);
        setActiveFamily(nextSession.families[0] ?? null);
      },
      async signOut() {
        if (session) {
          try {
            await authApi.logout(session.accessToken);
          } catch {
            /* 始终清理本机凭证 */
          }
        }
        await Promise.all([clearAuthSession(), clearSensitiveLocalData()]);
        setSession(null);
        setActiveFamily(null);
      },
      async signOutAll() {
        if (!session) {
          await Promise.all([clearAuthSession(), clearSensitiveLocalData()]);
          setSession(null);
          setActiveFamily(null);
          return { revokedCount: 0 };
        }
        const result = await authApi.logoutAll(session.accessToken);
        await Promise.all([clearAuthSession(), clearSensitiveLocalData()]);
        setSession(null);
        setActiveFamily(null);
        return result;
      },
      addFamily(family) {
        setSession((current) =>
          current ? { ...current, families: [...current.families, family] } : current,
        );
        setActiveFamily(family);
      },
      selectFamily: setActiveFamily,
    }),
    [activeFamily, restoring, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
