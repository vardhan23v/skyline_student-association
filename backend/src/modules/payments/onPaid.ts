import type { Knex } from 'knex';
import { confirmTicket } from '../events/service';
import { activateMembership } from '../memberships/service';
import { markOrderPaid } from '../merchandise/service';

export type PaymentRow = { id: number; user_id: number | null; amount: string | number; purpose: 'dues' | 'ticket' | 'merch'; reference_type: string; reference_id: number; status: string };

/** Fan out a paid payment to the owning module. Each confirm* writes its own ledger entry via finance.recordEntry. */
export async function onPaymentPaid(trx: Knex.Transaction, payment: PaymentRow) {
  switch (payment.purpose) {
    case 'ticket': return confirmTicket(trx, payment.reference_id, payment.id);
    case 'dues': return activateMembership(trx, payment.reference_id, payment.id);
    case 'merch': return markOrderPaid(trx, payment.reference_id, payment.id);
  }
}
