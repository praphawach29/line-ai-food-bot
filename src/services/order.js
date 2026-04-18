'use strict';

const { lineClient, supabase }  = require('../clients');
const { getOrCreateCart }       = require('./cart');
const flex                      = require('../builders/flex');

function generateOrderId() {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${date}-${rand}`;
}

// ─── Start Checkout (preview before confirming) ───────────────────────────────
async function startCheckout(userId, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: items } = await supabase
    .from('cart_items')
    .select('*, menus(name)')
    .eq('cart_id', cart.id);

  if (!items || items.length === 0) {
    return lineClient.replyMessage(replyToken, {
      type: 'text',
      text: 'ตะกร้าว่างอยู่ค่ะ กรุณาเลือกเมนูก่อนนะคะ',
    });
  }

  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  return lineClient.replyMessage(replyToken, flex.buildCheckoutSummaryBubble(items, total));
}

// ─── Confirm Order ────────────────────────────────────────────────────────────
async function confirmOrder(userId, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: items } = await supabase
    .from('cart_items')
    .select('*, menus(name, price)')
    .eq('cart_id', cart.id);

  if (!items || items.length === 0) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ตะกร้าว่างอยู่ค่ะ' });
  }

  const total   = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const orderId = generateOrderId();

  await supabase.from('orders').insert({
    id:           orderId,
    line_user_id: userId,
    total_amount: total,
    status:       'pending_payment',
  });

  await supabase.from('order_items').insert(
    items.map(i => ({
      order_id:   orderId,
      menu_id:    i.menu_id,
      menu_name:  i.menus.name,
      quantity:   i.quantity,
      unit_price: i.unit_price,
      subtotal:   i.unit_price * i.quantity,
    }))
  );

  await supabase.from('carts').update({ status: 'checked_out' }).eq('id', cart.id);

  const promptPayNumber = process.env.PROMPTPAY_NUMBER || '0812345678';
  const qrUrl = `https://promptpay.io/${promptPayNumber}/${total.toFixed(2)}.png`;

  return lineClient.replyMessage(replyToken, [
    flex.buildConfirmOrderBubble(orderId, total, promptPayNumber, qrUrl),
  ]);
}

// ─── Confirm Payment (waiting for slip) ──────────────────────────────────────
async function confirmPayment(userId, orderId, replyToken) {
  return lineClient.replyMessage(replyToken, {
    type: 'text',
    text: `📸 กรุณาถ่ายภาพสลิปการโอนเงิน แล้วส่งมาในแชทนี้เลยค่ะ\n\nออเดอร์ #${orderId}\n\nทีมงานจะตรวจสอบและยืนยันออเดอร์ภายใน 5 นาทีค่ะ 🙏`,
  });
}

module.exports = { startCheckout, confirmOrder, confirmPayment };
