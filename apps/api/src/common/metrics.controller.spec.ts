import { describe, expect, it } from 'vitest';
import { metricsCredential } from './metrics.controller';

describe('metricsCredential', () => {
  it('supports Prometheus standard Bearer authorization', () => {
    expect(metricsCredential(undefined, 'Bearer production-token')).toBe('production-token');
    expect(metricsCredential(undefined, 'bearer another-token')).toBe('another-token');
  });

  it('prefers the backwards-compatible custom header and rejects other schemes', () => {
    expect(metricsCredential('custom-token', 'Bearer bearer-token')).toBe('custom-token');
    expect(metricsCredential(undefined, 'Basic abc')).toBeUndefined();
  });
});
