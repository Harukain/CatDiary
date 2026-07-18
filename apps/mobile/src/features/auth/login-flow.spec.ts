import { describe, expect, it } from 'vitest';
import { resolveLoginRedirect } from './login-flow';

describe('login flow redirect rules', () => {
  it('keeps valid family invite redirects after login', () => {
    expect(resolveLoginRedirect('/family-invites/invite-token')).toBe(
      '/family-invites/invite-token',
    );
    expect(resolveLoginRedirect(['/family-invites/encoded%2Ftoken', '/ignored'])).toBe(
      '/family-invites/encoded%2Ftoken',
    );
  });

  it('falls back to home for unsafe or unsupported next paths', () => {
    expect(resolveLoginRedirect()).toBe('/');
    expect(resolveLoginRedirect('/family-invites/')).toBe('/');
    expect(resolveLoginRedirect('/family-invites/token/extra')).toBe('/');
    expect(resolveLoginRedirect('/family-invites/token?debug=true')).toBe('/');
    expect(resolveLoginRedirect('/(tabs)/records')).toBe('/');
    expect(resolveLoginRedirect('https://example.com/family-invites/token')).toBe('/');
  });
});
