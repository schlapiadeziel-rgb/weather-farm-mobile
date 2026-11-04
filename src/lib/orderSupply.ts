import type { Game } from './farmTypes';

/** Navigation context only; order identity never comes from its display number. */
export interface OrderSupplyOrigin {
  orderId: string;
  kind: 'truck' | 'boat';
  orderNumber: number;
}

export function resolveOrderReturn(game: Pick<Game, 'orders'>, origin: OrderSupplyOrigin) {
  const exists = game.orders.some(order => order.id === origin.orderId && order.kind === origin.kind);
  return { kind: origin.kind, orderId: exists ? origin.orderId : undefined };
}
