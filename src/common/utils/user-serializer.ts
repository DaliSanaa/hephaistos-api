import type { User as PrismaUser } from '@prisma/client';

/** Shape aligned with storefront `User` (lowercase role / userType). */
export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'business' | 'private';
  role: 'buyer' | 'seller' | 'admin';
  phone: string | null;
  companyName: string | null;
  vatNumber: string | null;
  countryCode: string;
  kycStatus: string;
  createdAt: string;
};

export function toPublicUser(user: PrismaUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    userType: user.userType === 'BUSINESS' ? 'business' : 'private',
    role:
      user.role === 'ADMIN'
        ? 'admin'
        : user.role === 'SELLER'
          ? 'seller'
          : 'buyer',
    phone: user.phone ?? null,
    companyName: user.companyName ?? null,
    vatNumber: user.vatNumber ?? null,
    countryCode: user.countryCode,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt.toISOString(),
  };
}
