import { lineClient, supabase, lineBlobClient } from './clients';
import { getAIRecommendation } from './ai';
import * as flex from './flex';

const GREETINGS = ['สวัสดี', 'เริ่ม', 'hello', 'hi', 'เมนู', 'menu', '/start'];

// --- Message Handlers ---
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
    // 1. Show thinking indicator (Loading Animation)
    // chat_id can be userId
    try {
      await lineClient.showLoadingAnimation({
        chatId: userId,
        loadingSeconds: 20 // Show for up to 20s or until a message is sent
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
    
    let textReply = `✨ ${aiResult.intro}`;
    if (aiResult.reason && aiResult.reason.trim() !== '') {
      textReply += `\n\n💡 ${aiResult.reason}`;
    }
    if (aiResult.tips && aiResult.tips.trim() !== '') {
      textReply += `\n\n🍃 ${aiResult.tips}`;
    }

    const messages: any[] = [
      {
        type: 'text',
        text: textReply,
      }
    ];

    if (recommended.length > 0) {
      messages.push(flex.buildMenuCarousel(recommended, 'เมนูแนะนำสำหรับคุณ'));
    }

    // 2. Reply ONLY ONCE at the end of process
    return lineClient.replyMessage({ replyToken, messages });
  } catch (err) {
    console.error('AI Flow Error:', err);
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'ขออภัยค่ะ ระบบแนะนำขัดข้องชั่วคราว ลองพิมพ์ว่า "เมนู" เพื่อดูอาหารทั้งหมดนะคะ' }]
    });
  }
}

// --- Image Handlers ---
export async function handleSlipImage(userId: string, messageId: string, replyToken: string) {
  console.log(`[Image Handler] Received slip from ${userId}`);
  
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('line_user_id', userId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!order) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'ไม่พบออเดอร์ที่รอชำระเงินค่ะ หากโอนแล้วรบกวนแจ้งแอดมินนะคะ' }]
    });
  }

  // Update order status
  await supabase.from('orders').update({
    status: 'paid',
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);

  return lineClient.replyMessage({
    replyToken,
    messages: [
      { type: 'text', text: `🎉 ได้รับสลิปเรียบร้อยแล้วค่ะ! ออเดอร์ #${order.id} กำลังจัดเตรียมให้นะคะ` },
      flex.buildOrderStatusCard(order.id, 'paid', order.total_amount)
    ]
  });
}

// --- Postback Handlers ---
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
        messages: [{ type: 'text', text: 'ขออภัยค่ะ คำสั่งนี้กำลังอยู่ช่วงพัฒนา' }]
      });
  }
}

// --- Sub-services (simplified from the user's migration) ---

// Real implementations for a fake local cart (In memory for preview only, resets on restart)
// In production, this should be in Redis or Supabase.
const userCarts: Record<string, { menuId: string, name: string, price: number, qty: number }[]> = {};

async function addToCart(userId: string, menuId: string, qty: number, replyToken: string) {
  const { data: menu } = await supabase.from('menus').select('*').eq('id', menuId).single();
  
  if (!menu) {
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'ขออภัย ไม่พบเมนูนี้ค่ะ' }]
    });
  }

  if (!userCarts[userId]) userCarts[userId] = [];
  
  const existing = userCarts[userId].find(i => i.menuId === menuId);
  if (existing) {
    existing.qty += qty;
  } else {
    userCarts[userId].push({ menuId, name: menu.name, price: menu.price, qty });
  }

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        { type: 'text', text: `✅ เพิ่ม "${menu.name}" ลงตะกร้าแล้วค่ะ` },
        [
          { label: 'ดูตะกร้า', action: 'postback', data: 'action=view_cart' },
          { label: 'สั่งเพิ่ม', action: 'message', data: 'เมนู' },
          { label: 'ยืนยันสั่งซื้อ', action: 'postback', data: 'action=checkout' }
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
          { type: 'text', text: 'ตะกร้าว่างเปล่าค่ะ 🥺 ดูเมนูหน่อยไหมคะ?' },
          [{ label: 'ดูเมนู', action: 'message' }]
        )
      ]
    });
  }

  const itemsText = cart.map((i, idx) => `${idx + 1}. ${i.name} (x${i.qty}) - ฿${i.price * i.qty}`).join('\n');
  const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        { type: 'text', text: `🛒 ตะกร้าของคุณ:\n\n${itemsText}\n\n🏷️ ยอดรวม: ฿${total}` },
        [
          { label: 'ยืนยันสั่งซื้อ', action: 'postback', data: 'action=checkout' },
          { label: 'สั่งเพิ่ม', action: 'message', data: 'เมนู' }
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
      messages: [{ type: 'text', text: 'ตะกร้าว่างเปล่า สั่งอาหารก่อนนะคะ' }]
    });
  }

  return lineClient.replyMessage({
    replyToken,
    messages: [
      flex.withQuickReplies(
        { type: 'text', text: 'เลือกวิธีชำระเงินได้เลยค่ะ 💳💵' },
        [
          { label: 'โอนเงิน', action: 'postback', data: 'action=pay_transfer' },
          { label: 'เงินสด (หน้าร้าน)', action: 'postback', data: 'action=pay_cash' }
        ]
      )
    ]
  });
}

async function payCash(userId: string, replyToken: string) {
  return createOrder(userId, replyToken, 'cash', 'pending_kitchen');
}

async function payTransfer(userId: string, replyToken: string) {
  let ppName = 'นาย ทดสอบ ระบบ';
  let ppNum = '0812345678';
  try {
    const fs = require('fs');
    const path = require('path');
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'settings.json'), 'utf-8'));
    if (s.promptpay_name) ppName = s.promptpay_name;
    if (s.promptpay_number) ppNum = s.promptpay_number;
  } catch(e) {}

  await createOrder(userId, replyToken, 'transfer', 'pending_payment', 
    `กรุณาโอนเงินมาที่\nพร้อมเพย์: ${ppNum}\nชื่อบัญชี: ${ppName}\n\n📸 โอนแล้วส่งสลิปมาในแชทนี้ได้เลยค่ะ`);
}

async function createOrder(userId: string, replyToken: string, paymentMethod: string, status: string, customMessage?: string) {
  const cart = userCarts[userId] || [];
  if (cart.length === 0) {
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'เกิดข้อผิดพลาด ตะกร้าว่างเปล่า' }] });
  }

  const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  // 1. Create order in generic format
  const { data: order, error } = await supabase.from('orders').insert({
    line_user_id: userId,
    total_amount: total,
    status: status,
    payment_method: paymentMethod
  }).select().single();

  if (error || !order) {
    console.error('Order Error:', error);
    return lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text: 'ขออภัย เกิดปัญหาในการสร้างออเดอร์' }] });
  }

  // 2. Clear local cart
  delete userCarts[userId];

  // 3. Reply
  const msgText = customMessage || `✅ สั่งซื้อสำเร็จ! ออเดอร์ #${order.id} ได้รับการคอนเฟิร์มแล้ว (เงินสด)\nรอรับอาหารได้เลยค่ะ`;

  return lineClient.replyMessage({
    replyToken,
    messages: [
      { type: 'text', text: msgText }
    ]
  });
}

async function confirmOrder(userId: string, replyToken: string) {
  return startCheckout(userId, replyToken); // Route old flow to checkout flow
}
