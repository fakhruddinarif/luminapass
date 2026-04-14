import { and, eq, isNull } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

import { db } from "../config/db";

export interface IBaseRepository<TSelect, TInsert, TUpdate, TId = string> {
  create(data: TInsert): Promise<TSelect>;
  update(id: TId, data: TUpdate): Promise<TSelect | null>;
  softDelete(id: TId): Promise<boolean>;
  delete(id: TId): Promise<boolean>;
  getById(
    id: TId,
    options?: { includeDeleted?: boolean },
  ): Promise<TSelect | null>;
}

interface RepositoryConfig<TTable extends PgTableWithColumns<any>> {
  table: TTable;
  idColumn: AnyColumn;
  deletedAtColumn?: AnyColumn;
  updatedAtColumn?: AnyColumn;
}

export class GeneralRepository<
  TTable extends PgTableWithColumns<any>,
  TId = string,
> implements IBaseRepository<
  TTable["$inferSelect"],
  TTable["$inferInsert"],
  Partial<TTable["$inferInsert"]>,
  TId
> {
  constructor(private readonly config: RepositoryConfig<TTable>) {}

  async create(data: TTable["$inferInsert"]): Promise<TTable["$inferSelect"]> {
    const [created] = await db
      .insert(this.config.table)
      .values(data)
      .returning();

    if (!created) {
      throw new Error("Failed to create record");
    }

    return created as TTable["$inferSelect"];
  }

  async getById(
    id: TId,
    options?: { includeDeleted?: boolean },
  ): Promise<TTable["$inferSelect"] | null> {
    const conditions: SQL<unknown>[] = [eq(this.config.idColumn, id as string)];

    if (!options?.includeDeleted && this.config.deletedAtColumn) {
      conditions.push(isNull(this.config.deletedAtColumn));
    }

    const rows = (await db
      .select()
      .from(this.config.table as any)
      .where(and(...conditions))
      .limit(1)) as Array<TTable["$inferSelect"]>;

    const row = rows[0];

    return (row as TTable["$inferSelect"] | undefined) ?? null;
  }

  async update(
    id: TId,
    data: Partial<TTable["$inferInsert"]>,
  ): Promise<TTable["$inferSelect"] | null> {
    const payload: Record<string, unknown> = { ...data };

    if (this.config.updatedAtColumn && payload.updatedAt === undefined) {
      payload.updatedAt = new Date();
    }

    const updatedRows = (await db
      .update(this.config.table)
      .set(payload as Partial<TTable["$inferInsert"]>)
      .where(eq(this.config.idColumn, id as string))
      .returning()) as Array<TTable["$inferSelect"]>;

    const updated = updatedRows[0];

    return (updated as TTable["$inferSelect"] | undefined) ?? null;
  }

  async softDelete(id: TId): Promise<boolean> {
    if (!this.config.deletedAtColumn) {
      throw new Error("Soft delete is not supported for this table");
    }

    const payload: Record<string, unknown> = {
      deletedAt: new Date(),
    };

    if (this.config.updatedAtColumn) {
      payload.updatedAt = new Date();
    }

    const updatedRows = (await db
      .update(this.config.table)
      .set(payload as Partial<TTable["$inferInsert"]>)
      .where(eq(this.config.idColumn, id as string))
      .returning()) as Array<TTable["$inferSelect"]>;

    const updated = updatedRows[0];

    return Boolean(updated);
  }

  async delete(id: TId): Promise<boolean> {
    const [deleted] = await db
      .delete(this.config.table)
      .where(eq(this.config.idColumn, id as string))
      .returning();

    return Boolean(deleted);
  }
}
