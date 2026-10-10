import { getDb } from '../../config/db';

export interface ProductInventoryCheck {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

export async function getLowStockProducts(): Promise<ProductInventoryCheck[]> {
  const db = getDb();
  const products = await db('products')
    .where('stock_quantity', '<=', db.raw('COALESCE(low_stock_threshold, 5)'))
    .select('id', 'name', 'stock_quantity', 'low_stock_threshold');

  return products.map((p) => ({
    ...p,
    is_low_stock: p.stock_quantity <= (p.low_stock_threshold ?? 5),
  }));
}
