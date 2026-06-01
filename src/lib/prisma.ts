import { empty, join, raw, skip, sqltag, type Sql } from '@prisma/client/runtime/library';

const Prisma = {
  sql: sqltag,
  join,
  raw,
  empty,
  skip,
};

const prisma = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === Symbol.toStringTag) return 'PrismaClient';
      if (property === 'then') return undefined;

      return () => {
        throw new Error(`Prisma client is not available for \`${String(property)}\` in this runtime. Use the local SQLite helpers instead.`);
      };
    },
  },
) as any;

export { Prisma, prisma };
export type PrismaSql = Sql;
