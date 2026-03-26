import type { UserRole, UserType } from '@prisma/client';

export type AuthUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  userType: UserType;
};
