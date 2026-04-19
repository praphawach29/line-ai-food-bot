import { lineClient, supabase, lineBlobClient } from './clients';
import { getAIRecommendation } from './ai';
import * as flex from './flex';
import fs from 'fs';
import path from 'path';

const GREETINGS = ['สวัสดี', 'เริ่ม', 'hello', 'hi', 'เมนู', 'menu', '/start'];

// ── ฟังก์ชันสุ่มข้อความ เพื่อไม่ให้ซ้ำกันทุกครั้ง ───────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── ชุดข้อความที่ใช้งาน ────────────────────────────────────────────────────

const CART_EMPTY_TEXTS = [
  'ตะกร้าว่างอยู่เลยค่ะ ยังไม่ได้สั่งอะไรเลยหรือเปล่า? 😊',
  'โอ้ ตะกร้าว่างเปล่าเลยนะคะ ดูเมนูก่อนได้เลยค่ะ',
  'ยังไม่มีอะไรในตะกร้าเลยค่ะ เลือกอะไรอร่อยๆ ก่อนนะคะ 🍜',
];

const CHECKOUT_PAYMENT_TEXTS = [
  'จะจ่ายสะดวกแบบไหนดีคะ? เลือกได้เลยนะคะ 😊',
  'เลือกช่องทางชำระเงินได้เลยค่ะ',
  'จ่ายแบบไหนสะดวกคะ? มีทั้งโอนและเงินสดนะคะ',
];

const ORDER_SUCCESS_CASH_TEXTS = (id: string | number) => [
  `เรียบร้อยเลยค่ะ! ออเดอร์ #${id} รับแล้วนะคะ ครัวกำลังเตรียมให้เลย รอสักครู่นะคะ 🍜`,
  `โอเคค่ะ! ออเดอร์ #${id} เข้าระบบแล้ว จ่ายเงินสดตอนรับของได้เลยนะคะ 😊`,
  `ได้เลยค่ะ สั่งเสร็จแล้ว! ออเดอร์ #${id} กำลังทำอยู่นะคะ รอแป๊บนึงนะ`,
];

const SLIP_NOT_FOUND_TEXTS = [
  'หาออเดอร์ที่รอชำระเงินไม่เจอเลยค่ะ ถ้าโอนแล้วรบกวน screenshot สลิปส่งมาอีกทีนะคะ 🙏',
  'ไม่เจอออเดอร์ที่ค้างอยู่ค่ะ ลองส่งสลิปอีกทีได้นะคะ หรือแจ้งแอดมินได้เลยค่ะ',
];

const SLIP_RECEIVED_TEXTS = (id: string | number) => [
  `ได้รับสลิปแล้วค่ะ! ออเดอร์ #${id} กำลังตรวจสอบอยู่นะคะ รอแป๊บเดียวเลยค่ะ 🎉`,
  `โอเคค่ะ สลิปเข้ามาแล้ว! ออเดอร์ #${id} รับเรื่องไว้แล้วนะคะ ขอบคุณมากเลยค่ะ 🙏`,
  `ขอบคุณมากนะคะ! ได้รับสลิปออเดอร์ #${id} แล้ว กำลังส่งต่อให้ครัวเลยค่ะ`,
];

const AI_ERROR_TEXTS = [
  'ขอโทษนะคะ ตอนนี้ระบบมีปัญหานิดหน่อย ลองพิมพ์ว่า "เมนู" เพื่อดูรายการทั้งหมดได้เลยนะคะ',
  'โห ระบบหน่วงนิดนึงค่ะ 😅 ลองใหม่อีกทีได้นะคะ หรือพิมพ์ "เมนู" เพื่อเลือกเองก็ได้ค่ะ',
  'ขอโทษค่ะ ตอบไม่ได้ชั่วคราวเลย ลองพิมพ์บอกความต้องการใหม่ได้นะคะ',
];

const MENU_NOT_FOUND_TEXTS = [
  'อ้าว หาเมนูนี้ไม่เจอเลยค่ะ ลองเลือกเมนูอื่นได้นะคะ 😊',
  'ขอโทษนะคะ ดูเหมือนเมนูนี้ไม่มีแล้วค่ะ เลือกอันอื่นได้นะคะ',
];

const ADD_TO_CART_TEXTS = (name: string) => [
  `เพิ่ม "${name}" ลงตะกร้าแล้วค่ะ 🛒`,
  `โอเค! "${name}" เข้าตะกร้าแล้วนะคะ`,
  `ได้เลยค่ะ "${name}" เพิ่มเข้าไปแล้ว 😊`,
];

const UNKNOWN_ACTION_TEXTS = [
  'ขอโทษนะคะ ยังทำตรงนี้ไม่ได้เลยค่ะ 😅',
  'อันนี้ยังพัฒนาอยู่เลยค่ะ รอหน่อยนะคะ',
];

// ── Message Handlers ───────────────────────────────────────────────────────

export async function handleTextMessage(userId: string, text: string, replyToken: string) {
  const normalized = text.trim().toLowerCase();
  console.log(`[Text Handler] User: ${userId}, Text: ${text}`);

  if (GREETINGS.some(g => normalized.includes(g))) {
    return lineClient.replyMessage({
      replyToken,
      messages: [flex.buildWelcomeMessage()]
    });
  }

  if (normalized.includes('ตะกร้า') || normalized.includes('cart')) {
    return showCart(userId, replyToken);
  }

  // AI Recommendation
  try {
    try {
      await lineClient.showLoadingAnimation({
        chatId: userId,
        loadingSeconds: 20
      });
    } catch (e) {
      console.warn('Failed to show loading animation:', e);
    }

    const { data: menus } = await supabase.from('menus').select('*').eq('available', true);
    if (!menus) throw new Error('No menus found');

    const menuList = menus.map(m =>
      `ID:${m.id} | ${m.name} | ราคา ฿${m.price} | ${m.calories}kcal | เผ็ด:${m.spicy_level}/3 | เจ:${m.is_vegan} | tags:${m.tags?.join(',') || ''}`
    ).join('\n');

    const aiResult = await getAIRecommendation(text, menuList);
    const recommended = menus.filter(m => (aiResult.menu_ids || []).includes(m.id));

    // ── ประกอบข้อความตอบกลับ ──────────────────────────────────────────────
    let textReply = aiResult.intro;

    if (aiResult.reason && aiResult.reason.trim() !== '') {
      textReply += `\n\n${aiResult.reason}`;
    }

    if (aiResult.tips && aiResult.tips.trim() !== '') {
      textReply += `\n\n${aiResult.tips}`;
    }

    const messages: any[] = [
      { type: 'text', text: textReply.trim() }
    ];

    if (recommended.length > 0) {
      messages.push(flex.buildMenuCarousel(recommended, 'เมนูที่คิดว่าน่าจะถูกใจ'));
    }

    return lineClient.replyMessage({ replyToken, messages });
  } catch (err) {
    console.error('AI Flow Error:', err);
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: pick(AI_ERROR_TEXTS) }]
    });
  }
}

// ── Image Handlers ─────────────────────────────────────────────────────────

export async function handleSlipImage(userId: string, messageId: string, replyToken: string) {
  console.log(`[Image Handler] Received slip from ${userId}`);

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('line_user_id', userId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !order) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: pick(SLIP_NOT_FOUND_TEXTS) }]
    });
  }

  await supabase.from('orders').update({
    status: 'paid',
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);

  return lineClient.replyMessage({
    replyToken,
    messages: [
      { type: 'text', text: pick(SLIP_RECEIVED_TEXTS(order.id)) },
      flex.buildOrderStatusCard(order.id, 'paid', order.total_amount)
    ]
  });
}

// ── Postback Handlers ──────────────────────────────────────────────────────

export async function handlePostback(userId: string, data: string, replyToken: string) {
  const params = Object.fromEntries(new URLSearchParams(data));
  const { action } = params;
  console.log(`[Postback Handler] Action: ${action}, Data: ${data}`);

  switch (action) {
    case 'add_to_cart':
      return addToCart(userId, params.menu_id, parseInt(params.qty || '1'), replyToken);
    case 'view_cart':
      return showCart(userId, replyToken);
    case 'checkout':
      return startCheckout(userId, replyToken);
    case 'confirm_order':
      return confirmOrder(userId, replyToken);
    case 'pay_cash':
      return payCash(userId, replyToken);
    case 'pay_transfer':
      return payTransfer(userId, replyToken);
    default:
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: pick(UNKNOWN_ACTION_TEXTS) }]
      });
  }
}

// ── Sub-services ───────────────────────────────────────────────────────────

const userCarts: Record<string, { menuId: string, name: string, price: number, qty: number }[]> = {};

async function addToCart(userId: string, menuId: string, qty: number, replyToken: string) {
  const { data: menu } = await supabase.from('menus').select('*').eq('id', menuId).single();
  const { data: menus } = await supabase.from('menus').select('*').eq('available', true);

  if (!menu || !menus) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: pick(MENU_NOT_FOUND_TEXTS) }]
    });
  }

  if (!userCarts[userId]) userCarts[userId] = [];

  const existing = userCarts[userId].find(i => i.menuId === menuId);
  if (existing) {
    existing.qty += qty;
  } else {
    userCarts[userId].push({ menuId, name: menu.name, price: menu.price, qty });
  }

  // AI upsell suggestion
  const menuList = menus.map(m => `ID:${m.id} | ${m.name} | Tags:${m.tags?.join(',') || ''}`).join('\n');
  const aiResult = await getAIRecommendation(
    `ลูกค้าเพิ่งสั่ง ${menu.name} แนะนำเครื่องดื่มหรือของทานเล่นที่เข้ากันได้สั้นๆ ไม่เกิน 1-2 ประโยค เป็นธรรมชาติ ไม่ต้องดูเป็นการขาย`,
    menuList
  );

  const cartCount = userCarts[userId].reduce((s, i) => s + i.qty, 0);
  let upsellText = `${pick(ADD_TO_CART_TEXTS(menu.name))} ตะกร้ามี ${cartCount} รายการแล้วนะคะ`;

  if (aiResult.reason && aiResult.reason.trim() !== '') {
    upsellText += `\n\n${aiResult.reason}`;
  } else if (aiResult.tips && aiResult.tips.trim() !== '') {
    upsellText += `\n\n${aiResult.tips}`;
  }

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        { type: 'text', text: upsellText },
        [
          { label: 'ดูตะกร้า 🛒', action: 'postback', data: 'action=view_cart' },
          { label: 'สั่งเพิ่ม 🍽️', action: 'message', data: 'เมนู' },
          { label: 'ยืนยันสั่งซื้อ ✅', action: 'postback', data: 'action=checkout' }
        ]
      )
    ]
  });
}

async function showCart(userId: string, replyToken: string) {
  const cart = userCarts[userId] || [];

  if (cart.length === 0) {
    return lineClient.replyMessage({
      replyToken,
      messages: [
        flex.withQuickReplies(
          { type: 'text', text: pick(CART_EMPTY_TEXTS) },
          [{ label: 'ดูเมนู 🍜', action: 'message', data: 'เมนู' }]
        )
      ]
    });
  }

  const itemsText = cart.map(i => `▫️ ${i.name} ×${i.qty}  ฿${i.price * i.qty}`).join('\n');
  const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        {
          type: 'text',
          text: `🛒 รายการในตะกร้า\n━━━━━━━━━━━━\n\n${itemsText}\n\n💰 รวมทั้งหมด ฿${total} ค่ะ`
        },
        [
          { label: 'ยืนยันสั่งซื้อ ✅', action: 'postback', data: 'action=checkout' },
          { label: 'สั่งเพิ่ม 🍽️', action: 'message', data: 'เมนู' }
        ]
      )
    ]
  });
}

async function startCheckout(userId: string, replyToken: string) {
  const cart = userCarts[userId] || [];
  if (cart.length === 0) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'ยังไม่ได้สั่งอะไรเลยนะคะ เลือกเมนูก่อนได้เลยค่ะ 😊' }]
    });
  }

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        { type: 'text', text: pick(CHECKOUT_PAYMENT_TEXTS) },
        [
          { label: '💳 โอนเงิน', action: 'postback', data: 'action=pay_transfer' },
          { label: '💵 เงินสด (หน้าร้าน)', action: 'postback', data: 'action=pay_cash' }
        ]
      )
    ]
  });
}

async function payCash(userId: string, replyToken: string) {
  return createOrder(userId, replyToken, 'cash', 'pending_kitchen');
}

async function payTransfer(userId: string, replyToken: string) {
  let ppName = 'ร้านข้าวต้มนิดา';
  let ppNum  = '0812345678';
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'settings.json'), 'utf-8'));
    if (s.promptpay_name)   ppName = s.promptpay_name;
    if (s.promptpay_number) ppNum  = s.promptpay_number;
  } catch(e) {}

  const cart  = userCarts[userId] || [];
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  await createOrder(
    userId,
    replyToken,
    'transfer',
    'pending_payment',
    `โอนเงินมาได้เลยนะคะ 😊\n\n🏦 พร้อมเพย์: ${ppNum}\n👤 ชื่อบัญชี: ${ppName}\n💰 ยอด: ฿${total}\n\nโอนแล้วส่งสลิปมาในแชทนี้ได้เลยค่ะ จะได้รีบทำอาหารให้นะคะ 🍜`
  );
}

async function createOrder(
  userId: string,
  replyToken: string,
  paymentMethod: string,
  status: string,
  customMessage?: string
) {
  const cart = userCarts[userId] || [];
  if (cart.length === 0) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'ตะกร้าว่างเปล่าค่ะ ลองสั่งใหม่ได้นะคะ' }]
    });
  }

  const total       = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const generatedId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

  try {
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      id:             generatedId,
      line_user_id:   userId,
      total_amount:   total,
      status:         status,
      payment_method: paymentMethod,
      updated_at:     new Date().toISOString()
    }).select().single();

    if (orderError || !order) {
      console.error('Order Insert Error:', orderError);
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: 'โห เกิดปัญหานิดนึงค่ะ ลองสั่งใหม่ได้นะคะ หรือแจ้งแอดมินได้เลย 🙏' }]
      });
    }

    const orderItems = cart.map(item => ({
      order_id:   order.id,
      menu_id:    item.menuId,
      menu_name:  item.name,
      quantity:   item.qty,
      unit_price: item.price,
      subtotal:   item.price * item.qty
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Order Items Error:', itemsError);
    }

    delete userCarts[userId];

    const msgText = customMessage || pick(ORDER_SUCCESS_CASH_TEXTS(order.id));

    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: msgText }]
    });
  } catch (err: any) {
    console.error('Create Order Exception:', err);
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'เกิดข้อผิดพลาดบางอย่างค่ะ ลองใหม่อีกทีได้นะคะ 🙏' }]
    });
  }
}

async function confirmOrder(userId: string, replyToken: string) {
  return startCheckout(userId, replyToken);
}
