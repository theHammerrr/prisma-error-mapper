import { Prisma } from '@prisma/client';

/** Prisma types the model keys; SQL migrations remain the source of truth for values. */
export const DatabaseConstraints = {
  [Prisma.ModelName.Account]: {
    NormalEmail: 'check normal email',
  },
  [Prisma.ModelName.Payment]: {
    PositiveAmount: 'payment amount positive',
  },
} as const satisfies Partial<
  Record<Prisma.ModelName, Record<string, string>>
>;
