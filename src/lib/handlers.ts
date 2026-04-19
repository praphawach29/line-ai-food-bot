import { lineClient, supabase } from './clients';
import { getAIRecommendation } from './ai';
import * as flex from './flex';
import fs from 'fs';
import path from 'path';

const GREETINGS = ['สวัสดี', 'เริ่ม', 'hello', 'hi', 'เมนู', 'menu', '/start'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CART_EMPTY_TEXTS = [
  'ตะกร้าว่างอยู่เลยค่ะ ยังไม่ได้สั่งอะไรเลยหรือเปล่า? 😊',
  'โอ้ ตะกร้าว่างเปล่าเลยนะคะ ดูเมนูก่อนได้เลยค่ะ',
  'ยังไม่มีอะไรในตะกร้าเลยค่ะ เลือกอะไรอร่อยๆ ก่อนนะคะ 🍜',
];
const CHECKOUT_TEXTS = [
  'จะจ่ายสะดวกแบบไหนดีคะ? เลือกได้เลยนะคะ 😊',
  'เลือกช่องทางชำระเงินได้เลยค่ะ',
  'จ่ายแบบไหนสะดวกคะ? มีทั้งโอนและเงินสดนะคะ',
];
const ORDER_CASH_TEXTS = (id: number) => [
  `เรียบร้อยเลยค่ะ! ออเดอร์ #${id} รับแล้ว ครัวกำลังทำให้เลย รอสักครู่นะคะ 🍜`,
  `โอเคค่ะ! ออเดอร์ #${id} เข้าระบบแล้ว รอแป๊บนึงนะคะ 😊`,
];
const SLIP_NOT_FOUND = [
  'หาออเดอร์ที่รอชำระไม่เจอเลยค่ะ ลองส่งสลิปอีกทีได้นะคะ 🙏',
  'ไม่เจอออเดอร์ค้างอยู่ค่ะ ลองแจ้งแอดมินได้เลยค่ะ',
];
const SLIP_OK = (id: number) => [
  `ได้รับสลิปแล้วค่ะ! ออเดอร์ #${id} กำลังตรวจสอบอยู่นะคะ 🎉`,
  `โอเคค่ะ สลิปเข้ามาแล้ว! ออเดอร์ #${id} รับเรื่องไว้แล้วนะคะ 🙏`,
];
const AI_ERROR = [
  'ขอโทษนะคะ ระบบมีปัญหานิดหน่อย ลองพิมพ์ว่า "เมนู" แทนได้เลยค่ะ',
  'โห ระบบหน่วงนิดนึงค่ะ 😅 ลองใหม่อีกทีได้นะคะ',
];
const MENU_NOT_FOUND = [
  'อ้าว หาเมนูนี้ไม่เจอเลยค่ะ ลองเลือกเมนูอื่นได้นะคะ 😊',
  'ขอโทษนะคะ ดูเหมือนเมนูนี้ไม่มีแล้วค่ะ',
];
const ADD_CART = (name: string) => [
  `เพิ่ม "${name}" ลงตะกร้าแล้วค่ะ 🛒`,
  `โอเค! "${name}" เข้าตะกร้าแล้วนะคะ`,
  `ได้เลยค่ะ "${name}" เพิ่มเข้าไปแล้ว 😊`,
];

// ── Text Handler ───────────────────────────────────────────────────────────

export async function handleTextMessage(userId: string, text: string, replyToken: string) {
  const n = text.trim().toLowerCase();
  if (GREETINGS.some(g => n.includes(g))) {
    return lineClient.replyMessage({ replyToken, messages: [flex.buildWelcomeMessage()] });
  }
  if (n.includes('ตะกร้า') || n.includes('cart')) return showCart(userId, replyToken);

  try {
    try { await lineClient.showLoadingAnimation({ chatId: userId, loadingSeconds: 20 }); } catch {}

    const { data: menus } = await supabase.from('menus').select('*').eq('available', true);
    if (!menus) throw new Error('no menus');

    const menuList = menus.map(m =>
      `ID:${m.id} | ${m.name} | ฿${m.price} | ${m.calories}kcal | เผ็ด:${m.spicy_level}/3 | เจ:${m.is_vegan} | tags:${m.tags?.join(',') || ''}`
    ).join('\n');

    const ai   = await getAIRecommendation(text, menuList);
    const recs = menus.filter(m => (ai.menu_ids || []).includes(m.id));

    let reply = ai.intro;
    if (ai.reason?.trim()) reply += `\n\n${ai.reason}`;
    if (ai.tips?.trim())   reply += `\n\n${ai.tips}`;

    const msgs: any[] = [{ type: 'text', text: reply.trim() }];
    if (recs.length > 0) msgs.push(flex.buildMenuCarousel(recs, 'เมนูที่น่าจะถูกใจ'));

    return lineClient.replyMessage({ replyToken, messages: msgs });
  } catch (err) {
    console.error('AI Error:', err);
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: pick(AI_ERROR) }] });
  }
}

// ── Slip Handler ───────────────────────────────────────────────────────────

export async function handleSlipImage(userId: string, _messageId: string, replyToken: string) {
  const { data: order } = await supabase
    .from('orders').select('*')
    .eq('line_user_id', userId).eq('status', 'pending_payment')
    .order('created_at', { ascending: false }).limit(1).single();

  if (!order) return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: pick(SLIP_NOT_FOUND) }] });

  await supabase.from('orders').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', order.id);

  return lineClient.replyMessage({
    replyToken,
    messages: [
      { type: 'text', text: pick(SLIP_OK(order.id)) },
      flex.buildOrderStatusCard(order.id, 'paid', order.total_amount)
    ]
  });
}

// ── Postback Handler ───────────────────────────────────────────────────────

export async function handlePostback(userId: string, data: string, replyToken: string) {
  const p = Object.fromEntries(new URLSearchParams(data));
  switch (p.action) {
    case 'add_to_cart':   return addToCart(userId, p.menu_id, parseInt(p.qty || '1'), replyToken);
    case 'view_cart':     return showCart(userId, replyToken);
    case 'checkout':
    case 'confirm_order': return startCheckout(userId, replyToken);
    case 'pay_cash':      return payCash(userId, replyToken);
    case 'pay_transfer':  return payTransfer(userId, replyToken);
    default:
      return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'ขอโทษนะคะ ยังทำตรงนี้ไม่ได้เลยค่ะ 😅' }] });
  }
}

// ── Cart ───────────────────────────────────────────────────────────────────

const userCarts: Record<string, { menuId: string; name: string; price: number; qty: number }[]> = {};

async function addToCart(userId: string, menuId: string, qty: number, replyToken: string) {
  const { data: menu }  = await supabase.from('menus').select('*').eq('id', menuId).single();
  const { data: menus } = await supabase.from('menus').select('*').eq('available', true);
  if (!menu || !menus) return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: pick(MENU_NOT_FOUND) }] });

  if (!userCarts[userId]) userCarts[userId] = [];
  const ex = userCarts[userId].find(i => i.menuId === menuId);
  if (ex) ex.qty += qty; else userCarts[userId].push({ menuId, name: menu.name, price: menu.price, qty });

  const menuList = menus.map(m => `ID:${m.id} | ${m.name} | Tags:${m.tags?.join(',') || ''}`).join('\n');
  const ai = await getAIRecommendation(`ลูกค้าสั่ง ${menu.name} แนะนำเครื่องดื่มที่เข้ากัน 1 ประโยคสั้นๆ`, menuList);

  const total = userCarts[userId].reduce((s, i) => s + i.qty, 0);
  let msg = `${pick(ADD_CART(menu.name))} ตะกร้ามี ${total} รายการแล้วนะคะ`;
  const extra = ai.reason?.trim() || ai.tips?.trim();
  if (extra) msg += `\n\n${extra}`;

  return lineClient.replyMessage({
    replyToken,
    messages: [flex.withQuickReplies(
      { type: 'text', text: msg },
      [
        { label: 'ดูตะกร้า 🛒',       action: 'postback', data: 'action=view_cart' },
        { label: 'สั่งเพิ่ม 🍽️',      action: 'message',  data: 'เมนู' },
        { label: 'ยืนยันสั่งซื้อ ✅', action: 'postback', data: 'action=checkout' }
      ]
    )]
  });
}

async function showCart(userId: string, replyToken: string) {
  const cart = userCarts[userId] || [];
  if (!cart.length) {
    return lineClient.replyMessage({
      replyToken,
      messages: [flex.withQuickReplies(
        { type: 'text', text: pick(CART_EMPTY_TEXTS) },
        [{ label: 'ดูเมนู 🍜', action: 'message', data: 'เมนู' }]
      )]
    });
  }

  const lines = cart.map(i => `▫️ ${i.name} ×${i.qty}  ฿${i.price * i.qty}`).join('\n');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return lineClient.replyMessage({
    replyToken,
    messages: [flex.withQuickReplies(
      { type: 'text', text: `🛒 รายการในตะกร้า\n━━━━━━━━━━━━\n\n${lines}\n\n💰 รวมทั้งหมด ฿${total} ค่ะ` },
      [
        { label: 'ยืนยันสั่งซื้อ ✅', action: 'postback', data: 'action=checkout' },
        { label: 'สั่งเพิ่ม 🍽️',     action: 'message',  data: 'เมนู' }
      ]
    )]
  });
}

// ── Checkout ───────────────────────────────────────────────────────────────

async function startCheckout(userId: string, replyToken: string) {
  if (!(userCarts[userId]?.length)) {
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'ยังไม่ได้สั่งอะไรเลยนะคะ เลือกเมนูก่อนได้เลยค่ะ 😊' }] });
  }
  return lineClient.replyMessage({
    replyToken,
    messages: [flex.withQuickReplies(
      { type: 'text', text: pick(CHECKOUT_TEXTS) },
      [
        { label: '💳 โอนเงิน',          action: 'postback', data: 'action=pay_transfer' },
        { label: '💵 เงินสด (หน้าร้าน)', action: 'postback', data: 'action=pay_cash' }
      ]
    )]
  });
}

async function payCash(userId: string, replyToken: string) {
  // ✅ BUG FIX: เปลี่ยนจาก 'pending_kitchen' → 'preparing' ให้ตรงกับ Kanban column
  return createOrder(userId, replyToken, 'cash', 'preparing');
}

async function payTransfer(userId: string, replyToken: string) {
  let ppName = 'ร้านข้าวต้มนิดา', ppNum = '0812345678';
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'settings.json'), 'utf-8'));
    if (s.promptpay_name)   ppName = s.promptpay_name;
    if (s.promptpay_number) ppNum  = s.promptpay_number;
  } catch {}

  const total = (userCarts[userId] || []).reduce((s, i) => s + i.price * i.qty, 0);
  await createOrder(userId, replyToken, 'transfer', 'pending_payment',
    `โอนเงินมาได้เลยนะคะ 😊\n\n🏦 พร้อมเพย์: ${ppNum}\n👤 ชื่อบัญชี: ${ppName}\n💰 ยอด: ฿${total}\n\nโอนแล้วส่งสลิปมาในแชทนี้ได้เลยค่ะ 🍜`
  );
}

async function createOrder(userId: string, replyToken: string, paymentMethod: string, status: string, customMessage?: string) {
  const cart = userCarts[userId] || [];
  if (!cart.length) return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'ตะกร้าว่างเปล่าค่ะ' }] });

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const id    = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

  try {
    const { data: order, error } = await supabase.from('orders').insert({
      id, line_user_id: userId, total_amount: total,
      status, payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    }).select().single();

    if (error || !order) {
      console.error('Order error:', error);
      return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'โห เกิดปัญหานิดนึงค่ะ ลองสั่งใหม่ได้นะคะ 🙏' }] });
    }

    await supabase.from('order_items').insert(
      cart.map(i => ({ order_id: order.id, menu_id: i.menuId, menu_name: i.name, quantity: i.qty, unit_price: i.price, subtotal: i.price * i.qty }))
    );

    delete userCarts[userId];
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: customMessage || pick(ORDER_CASH_TEXTS(order.id)) }] });
  } catch (err) {
    console.error('Exception:', err);
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'เกิดข้อผิดพลาดบางอย่างค่ะ ลองใหม่อีกทีได้นะคะ 🙏' }] });
  }
}
