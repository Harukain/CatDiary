export type LoginRedirectPath = '/' | `/family-invites/${string}`;

const familyInvitePathPattern = /^\/family-invites\/[^/?#]+$/;

export function resolveLoginRedirect(next?: string | string[]): LoginRedirectPath {
  const value = Array.isArray(next) ? next[0] : next;
  if (value && familyInvitePathPattern.test(value)) {
    return value as `/family-invites/${string}`;
  }
  return '/';
}
