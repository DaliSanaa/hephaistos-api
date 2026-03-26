/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { Prisma, PrismaClient } from '@prisma/client';

function withDeletedNull<T extends object | undefined>(
  where: T,
): T extends undefined
  ? { deletedAt: null }
  : { AND: [NonNullable<T>, { deletedAt: null }] } {
  if (where === undefined || Object.keys(where).length === 0) {
    return { deletedAt: null } as ReturnType<typeof withDeletedNull<T>>;
  }
  return { AND: [where, { deletedAt: null }] } as ReturnType<
    typeof withDeletedNull<T>
  >;
}

/** Soft-delete behaviour for models that expose `deletedAt`. */
export function softDeleteExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'softDelete',
    query: {
      user: {
        findMany({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        findFirst({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        findUnique({ args }: { args: any }) {
          return base.user.findFirst({
            where: { ...args.where, deletedAt: null },
          });
        },
        count({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        update({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        updateMany({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        async delete({ args }: { args: any }) {
          return base.user.update({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.user.updateMany({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
      },
      lot: {
        findMany({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        findFirst({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        findUnique({ args }: { args: any }) {
          return base.lot.findFirst({
            where: { ...args.where, deletedAt: null },
          });
        },
        count({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        update({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        updateMany({ args, query }: { args: any; query: any }) {
          args.where = withDeletedNull(args.where);
          return query(args);
        },
        async delete({ args }: { args: any }) {
          return base.lot.update({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.lot.updateMany({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<
  typeof createExtendedPrismaClient
>;

export function createExtendedPrismaClient() {
  const base = new PrismaClient();
  return base.$extends(softDeleteExtension(base));
}
