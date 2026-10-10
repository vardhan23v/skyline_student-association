import type { Knex } from 'knex';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export async function paginateQuery<T>(
  query: Knex.QueryBuilder,
  options: PaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const countQuery = query.clone().clearSelect().clearOrder().count<{ count: string | number }>('* as count').first();
  const countResult = await countQuery;
  const total = Number(countResult?.count || 0);

  if (options.sortBy) {
    query.orderBy(options.sortBy, options.sortOrder || 'desc');
  }

  const data = await query.offset(offset).limit(limit);
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
