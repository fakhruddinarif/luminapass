import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../config/db";
import type { CreateUserParams } from "../dtos/user";
import { users } from "../entities/users";
import type { AuthUserRepositoryContract } from "../interfaces/auth.interface";
import { GeneralRepository } from "./base.repository";

const usersBaseRepository = new GeneralRepository({
  table: users,
  idColumn: users.id,
  deletedAtColumn: users.deletedAt,
  updatedAtColumn: users.updatedAt,
});

export interface UserRepository extends AuthUserRepositoryContract {
  update(
    id: string,
    data: Partial<typeof users.$inferInsert>,
  ): Promise<typeof users.$inferSelect | null>;
  softDelete(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  getById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<typeof users.$inferSelect | null>;
}

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: and(eq(users.email, email), isNull(users.deletedAt)),
  });
}

export async function findUserByUsername(username: string) {
  return db.query.users.findFirst({
    where: and(eq(users.username, username), isNull(users.deletedAt)),
  });
}

export async function findUserById(id: string) {
  return db.query.users.findFirst({
    where: and(eq(users.id, id), isNull(users.deletedAt)),
  });
}

export async function findUserByEmailOrUsername(
  email: string,
  username: string,
) {
  return db.query.users.findFirst({
    where: and(
      or(eq(users.email, email), eq(users.username, username)),
      isNull(users.deletedAt),
    ),
  });
}

export async function createUser(input: CreateUserParams) {
  return usersBaseRepository.create({
    email: input.email,
    username: input.username,
    fullName: input.fullName,
    passwordHash: input.passwordHash,
    phone: input.phone,
    avatarUrl: input.avatarUrl,
  });
}

export async function updateLastLoginAt(id: string, loginAt: Date) {
  await db
    .update(users)
    .set({
      lastLoginAt: loginAt,
      updatedAt: loginAt,
    })
    .where(eq(users.id, id));
}

export const userRepository: UserRepository = {
  create: createUser,
  update: (id, data) => usersBaseRepository.update(id, data),
  softDelete: (id) => usersBaseRepository.softDelete(id),
  delete: (id) => usersBaseRepository.delete(id),
  getById: (id, options) => usersBaseRepository.getById(id, options),
  findUserByEmail,
  findUserByUsername,
  findUserById,
  findUserByEmailOrUsername,
  updateLastLoginAt,
};
