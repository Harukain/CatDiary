import { describe, expect, it } from 'vitest';
import notificationLogsSource from '../../../app/notification-logs.tsx?raw';

describe('notification log mobile layout', () => {
  it('keeps notification log actions fixed and safe-area aware', () => {
    expect(notificationLogsSource).toContain('useSafeAreaInsets');
    expect(notificationLogsSource).toContain('testID="notification-logs.footer"');
    expect(notificationLogsSource).toContain('testID="notification-logs.refresh.button"');
    expect(notificationLogsSource).toContain('testID="notification-logs.return.button"');
    expect(notificationLogsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(notificationLogsSource).toContain("label={error ? '重新加载提醒记录' : '刷新提醒记录'}");
  });

  it('does not leave the page loading when session context is missing', () => {
    expect(notificationLogsSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(notificationLogsSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(notificationLogsSource).toContain('if (restoring) return;');
    expect(notificationLogsSource).toContain('if (!session || !activeFamily) {');
    expect(notificationLogsSource).toContain('setItems([]);');
    expect(notificationLogsSource).toContain('setNextCursor(null);');
    expect(notificationLogsSource).toContain('setLastLoadedAt(null);');
    expect(notificationLogsSource).toContain("setError('');");
    expect(notificationLogsSource).toContain("setSuccess('');");
    expect(notificationLogsSource).toContain('setLoading(false);');
    expect(notificationLogsSource).toContain('setLoadingMore(false);');
    expect(notificationLogsSource).toContain('testID="notification-logs.loading.card"');
    expect(notificationLogsSource).toContain('testID="notification-logs.context-unavailable.card"');
    expect(notificationLogsSource).toContain(`return;
      }
      if (append)`);
  });

  it('locks filter changes while refresh, pagination, or retry is in progress', () => {
    expect(notificationLogsSource).toContain(
      'const refreshingDisabled = restoring || contextUnavailable || loadingMore || !!retryingId;',
    );
    expect(notificationLogsSource).toMatch(
      /const interactionDisabled\s*=\s*restoring \|\| contextUnavailable \|\| loading \|\| loadingMore \|\| !!retryingId;/,
    );
    expect(notificationLogsSource).toContain('disabled={interactionDisabled}');
    expect(notificationLogsSource).toContain('disabled: interactionDisabled');
    expect(notificationLogsSource).toContain('interactionDisabled && styles.disabled');
  });
});
