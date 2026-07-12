export interface AccessTokenPayload {
  sub: string;
  sid: string;
  ver: number;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user: AccessTokenPayload;
}
