'use strict';
require('dotenv').config();

const express    = require('express');
const line       = require('@line/bot-sdk');
const Anthropic  = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ──────────────────────────────────────────────────────────────────
const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
};

const lineClient = new line.Client(lineConfig);
const claude     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase   = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Express Setup ────────────────────────────────────────────────────────────
app.use('/webhook', line.middleware(lineConfig));
app.use(express.json());

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const path = require('path');
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ─── Webhook Entry ────────────────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  res.status(200).end();
  Promise.all(req.body.events.map(handleEvent)).catch(console.error);
});

// ─── Event Router ─────────────────────────────────────────────────────────────
async function handleEvent(event) {
  const userId = event.source.userId;
  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(userId, event.message.text, event.replyToken);
  }
  if (event.type === 'message' && event.message.type === 'image') {
    return handleSlipImage(userId, event.message.id, event.replyToken);
  }
  if (event.type === 'postback') {
    return handlePostback(userId, event.postback.data, event.replyToken);
  }
}

// ─── Text Message Handler ─────────────────────────────────────────────────────
async function handleTextMessage(userId, text, replyToken) {
  const normalized = text.trim().toLowerCase();

  // คำทักทายหรือเริ่มต้นใหม่
  const greetings = ['สวัสดี', 'เริ่ม', 'hello', 'hi', 'เมนู', 'menu', '/start'];
  if (greetings.some(g => normalized.includes(g))) {
    return lineClient.replyMessage(replyToken, buildWelcomeMessage());
  }

  // ดูตะกร้า
  if (normalized.includes('ตะกร้า') || normalized.includes('cart')) {
    return showCart(userId, replyToken);
  }

  // ─── AI Recommendation Mode ───────────────────────────────────────────────
  // ข้อความที่ไม่ตรงคำสั่ง → ถือว่าลูกค้ากำลังบอกความต้องการกับ AI
  return handleAIRecommendation(userId, text, replyToken);
}

// ─── AI Recommendation ────────────────────────────────────────────────────────
async function handleAIRecommendation(userId, userMessage, replyToken) {
  // แสดง typing indicator
  await lineClient.replyMessage(replyToken, {
    type: 'text',
    text: '🤖 AI กำลังคิดเมนูที่เหมาะกับคุณ...',
  });

  // ดึงเมนูทั้งหมด
  const { data: menus } = await supabase
    .from('menus')
    .select('*')
    .eq('available', true);

  const menuList = menus.map(m =>
    `ID:${m.id} | ${m.name} | ราคา ฿${m.price} | ${m.calories}kcal | เผ็ด:${m.spicy_level}/3 | เจ:${m.is_vegan} | tags:${m.tags.join(',')}`
  ).join('\n');

  // เรียก Claude
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `คุณเป็นผู้ช่วย AI ของร้านอาหารชื่อ "ร้านข้าวต้มนิดา" ช่วยแนะนำเมนูตามความต้องการของลูกค้า
ตอบกลับเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายนอก JSON

รูปแบบ JSON ที่ต้องการ:
{
  "intro": "ข้อความแนะนำสั้น ๆ อบอุ่น 1-2 ประโยค บอกว่า AI เข้าใจความต้องการอะไร",
  "reason": "อธิบายว่าทำไมถึงแนะนำเมนูเหล่านี้",
  "menu_ids": ["M001","M002","M003"],
  "tips": "เคล็ดลับหรือคำแนะนำเพิ่มเติมสั้น ๆ (ถ้าไม่มีให้เป็น null)"
}

กฎ:
- แนะนำ 2-4 เมนูเท่านั้น
- เลือกจาก menu_ids ที่มีในรายการด้านล่างเท่านั้น
- ถ้าลูกค้าไม่กินเผ็ด ให้เลือก spicy_level=0 เท่านั้น
- ถ้าลูกค้ากินเจ ให้เลือก is_vegan=true เท่านั้น
- ถ้าลูกค้าอยากลดน้ำหนัก ให้เลือก calories < 300 เท่านั้น

รายการเมนูทั้งหมด:
${menuList}`,
    messages: [{ role: 'user', content: userMessage }],
  });

  let aiResult;
  try {
    const raw = response.content[0].text.replace(/```json|```/g, '').trim();
    aiResult = JSON.parse(raw);
  } catch {
    return lineClient.pushMessage(userId, {
      type: 'text',
      text: 'ขออภัยค่ะ AI ขัดข้องชั่วคราว กรุณาลองใหม่ หรือกด "ดูเมนูทั้งหมด" ค่ะ',
    });
  }

  // ดึงเมนูที่ AI แนะนำ
  const recommended = menus.filter(m => aiResult.menu_ids.includes(m.id));

  // ส่งข้อความ
  const messages = [];

  // 1. ข้อความ intro จาก AI
  messages.push({
    type: 'text',
    text: `✨ ${aiResult.intro}\n\n💡 ${aiResult.reason}${aiResult.tips ? '\n\n🍃 ' + aiResult.tips : ''}`,
  });

  // 2. Flex Message carousel เมนูแนะนำ
  if (recommended.length > 0) {
    messages.push(buildMenuCarousel(recommended, 'เมนูแนะนำโดย AI สำหรับคุณ'));
  }

  // 3. ปุ่มตัวเลือก
  messages.push({
    type: 'text',
    text: 'ต้องการอะไรเพิ่มไหมคะ?',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '🛒 ดูตะกร้า', data: 'action=view_cart' } },
        { type: 'action', action: { type: 'message', label: '📋 ดูเมนูทั้งหมด', text: 'ดูเมนูทั้งหมด' } },
        { type: 'action', action: { type: 'message', label: '🔄 ถามใหม่', text: 'เริ่มใหม่' } },
      ],
    },
  });

  return lineClient.pushMessage(userId, messages);
}

// ─── Postback Handler ─────────────────────────────────────────────────────────
async function handlePostback(userId, data, replyToken) {
  const params = Object.fromEntries(new URLSearchParams(data));
  const { action } = params;

  switch (action) {
    case 'browse_menu':
      return showMenuCategories(userId, replyToken);

    case 'browse_category':
      return showMenuByCategory(userId, params.category, replyToken);

    case 'add_to_cart':
      return addToCart(userId, params.menu_id, parseInt(params.qty || '1'), replyToken);

    case 'view_cart':
      return showCart(userId, replyToken);

    case 'remove_item':
      return removeCartItem(userId, params.item_id, replyToken);

    case 'checkout':
      return startCheckout(userId, replyToken);

    case 'confirm_order':
      return confirmOrder(userId, replyToken);

    case 'confirm_payment':
      return confirmPayment(userId, params.order_id, replyToken);

    default:
      return lineClient.replyMessage(replyToken, { type: 'text', text: 'ขออภัยค่ะ ไม่เข้าใจคำสั่งนี้' });
  }
}

// ─── Cart Operations ──────────────────────────────────────────────────────────

/** หรือสร้าง cart ถ้ายังไม่มี */
async function getOrCreateCart(userId) {
  let { data: cart } = await supabase
    .from('carts')
    .select('*')
    .eq('line_user_id', userId)
    .eq('status', 'active')
    .single();

  if (!cart) {
    const { data: newCart } = await supabase
      .from('carts')
      .insert({ line_user_id: userId })
      .select()
      .single();
    cart = newCart;
  }
  return cart;
}

/** เพิ่มสินค้าลงตะกร้า */
async function addToCart(userId, menuId, qty, replyToken) {
  const cart = await getOrCreateCart(userId);

  // ดึงราคาจาก menus
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, price')
    .eq('id', menuId)
    .single();

  if (!menu) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ไม่พบเมนูนี้ค่ะ' });
  }

  // ตรวจว่ามีในตะกร้าแล้วหรือยัง
  const { data: existing } = await supabase
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart.id)
    .eq('menu_id', menuId)
    .single();

  if (existing) {
    // เพิ่มจำนวน
    await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + qty })
      .eq('id', existing.id);
  } else {
    // เพิ่มรายการใหม่
    await supabase.from('cart_items').insert({
      cart_id:    cart.id,
      menu_id:    menuId,
      quantity:   qty,
      unit_price: menu.price,
    });
  }

  // นับรายการทั้งหมดในตะกร้า
  const { count } = await supabase
    .from('cart_items')
    .select('*', { count: 'exact' })
    .eq('cart_id', cart.id);

  return lineClient.replyMessage(replyToken, {
    type: 'flex',
    altText: `เพิ่ม ${menu.name} ลงตะกร้าแล้ว`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '✅ เพิ่มลงตะกร้าแล้ว', weight: 'bold', color: '#06C755', size: 'sm' },
          { type: 'text', text: menu.name, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: `฿${menu.price} × ${qty}`, color: '#666', size: 'sm' },
          { type: 'text', text: `ตะกร้าของคุณมี ${count} รายการ`, color: '#999', size: 'xs', margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'message', label: '🍜 สั่งเพิ่ม', text: 'ดูเมนูทั้งหมด' },
          },
          {
            type: 'button', style: 'primary', height: 'sm', color: '#06C755',
            action: { type: 'postback', label: '🛒 ดูตะกร้า', data: 'action=view_cart' },
          },
        ],
      },
    },
  });
}

/** แสดงตะกร้า */
async function showCart(userId, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: items } = await supabase
    .from('cart_items')
    .select('*, menus(name, price, image_url)')
    .eq('cart_id', cart.id);

  if (!items || items.length === 0) {
    return lineClient.replyMessage(replyToken, {
      type: 'flex',
      altText: 'ตะกร้าว่างเปล่า',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          alignItems: 'center',
          spacing: 'md',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: '🛒', size: '3xl', align: 'center' },
            { type: 'text', text: 'ตะกร้าว่างเปล่า', weight: 'bold', align: 'center', size: 'lg' },
            { type: 'text', text: 'เริ่มสั่งอาหารได้เลยค่ะ', color: '#888', align: 'center', size: 'sm' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button', style: 'primary', color: '#06C755',
            action: { type: 'postback', label: '🍜 เลือกเมนู', data: 'action=browse_menu' },
          }],
        },
      },
    });
  }

  const total = items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);

  // สร้าง Flex Message สรุปตะกร้า
  const itemRows = items.map(i => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 4,
        contents: [
          { type: 'text', text: i.menus.name, size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: `฿${i.unit_price} × ${i.quantity}`, size: 'xs', color: '#888' },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 2,
        alignItems: 'flex-end',
        contents: [
          { type: 'text', text: `฿${(i.unit_price * i.quantity).toFixed(0)}`, size: 'sm', weight: 'bold', align: 'end' },
          {
            type: 'button', height: 'sm',
            action: {
              type: 'postback',
              label: 'ลบ',
              data: `action=remove_item&item_id=${i.id}`,
            },
            style: 'link',
            color: '#E53935',
          },
        ],
      },
    ],
  }));

  // แทรก separator ระหว่างแต่ละรายการ
  const rowsWithSep = itemRows.reduce((acc, row, i) => {
    acc.push(row);
    if (i < itemRows.length - 1) {
      acc.push({ type: 'separator', margin: 'sm', color: '#F0F0F0' });
    }
    return acc;
  }, []);

  return lineClient.replyMessage(replyToken, {
    type: 'flex',
    altText: `ตะกร้าของคุณ — รวม ฿${total.toFixed(0)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        contents: [{
          type: 'text',
          text: '🛒 ตะกร้าของคุณ',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'lg',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...rowsWithSep,
          { type: 'separator', margin: 'md', color: '#DDD' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'รวมทั้งหมด', weight: 'bold', size: 'md', flex: 3 },
              { type: 'text', text: `฿${total.toFixed(0)}`, weight: 'bold', size: 'lg', color: '#E53935', align: 'end', flex: 2 },
            ],
          },
          {
            type: 'text',
            text: 'ราคาดังกล่าวยังไม่รวมค่าจัดส่ง',
            color: '#AAA',
            size: 'xxs',
            align: 'end',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: '#06C755',
            action: { type: 'postback', label: '✅ ยืนยันสั่งอาหาร', data: 'action=checkout' },
          },
          {
            type: 'button', style: 'secondary',
            action: { type: 'message', label: '🍜 สั่งเพิ่ม', text: 'ดูเมนูทั้งหมด' },
          },
        ],
      },
    },
  });
}

/** ลบรายการออกจากตะกร้า */
async function removeCartItem(userId, itemId, replyToken) {
  await supabase.from('cart_items').delete().eq('id', itemId);
  return showCart(userId, replyToken);
}

// ─── Checkout Flow ────────────────────────────────────────────────────────────

/** เริ่ม checkout — แสดงสรุปก่อนยืนยัน */
async function startCheckout(userId, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: items } = await supabase
    .from('cart_items')
    .select('*, menus(name)')
    .eq('cart_id', cart.id);

  if (!items || items.length === 0) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ตะกร้าว่างอยู่ค่ะ กรุณาเลือกเมนูก่อนนะคะ' });
  }

  const total     = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const itemLines = items.map(i => `• ${i.menus.name} ×${i.quantity} = ฿${(i.unit_price * i.quantity).toFixed(0)}`).join('\n');

  return lineClient.replyMessage(replyToken, {
    type: 'flex',
    altText: `สรุปออเดอร์ — รวม ฿${total.toFixed(0)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1A1A2E',
        contents: [
          { type: 'text', text: '📋 สรุปออเดอร์', color: '#FFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'กรุณาตรวจสอบก่อนยืนยัน', color: '#AAA', size: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: itemLines,
            wrap: true,
            size: 'sm',
            color: '#333',
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ยอดรวม', weight: 'bold', size: 'md' },
              { type: 'text', text: `฿${total.toFixed(0)}`, weight: 'bold', size: 'xl', color: '#E53935', align: 'end' },
            ],
          },
          {
            type: 'text',
            text: '⚠️ หลังยืนยันแล้ว ไม่สามารถแก้ไขออเดอร์ได้',
            wrap: true,
            size: 'xxs',
            color: '#F57C00',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: '#E53935',
            action: { type: 'postback', label: '✅ ยืนยันสั่งอาหาร', data: 'action=confirm_order' },
          },
          {
            type: 'button', style: 'secondary',
            action: { type: 'postback', label: '✏️ แก้ไขออเดอร์', data: 'action=view_cart' },
          },
        ],
      },
    },
  });
}

/** ยืนยันออเดอร์ — สร้าง order record และส่ง QR PromptPay */
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

  // สร้าง order
  await supabase.from('orders').insert({
    id:           orderId,
    line_user_id: userId,
    total_amount: total,
    status:       'pending_payment',
  });

  // สร้าง order_items
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

  // ล้างตะกร้า
  await supabase.from('carts').update({ status: 'checked_out' }).eq('id', cart.id);

  // PromptPay QR URL (ใช้ promptpay.io หรือ API ของ bank)
  const promptPayNumber = process.env.PROMPTPAY_NUMBER || '0812345678';
  const qrUrl = `https://promptpay.io/${promptPayNumber}/${total.toFixed(2)}.png`;

  return lineClient.replyMessage(replyToken, [
    {
      type: 'flex',
      altText: `ออเดอร์ #${orderId} — ยืนยันแล้ว`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#06C755',
          contents: [
            { type: 'text', text: '✅ ยืนยันออเดอร์แล้ว', color: '#FFF', weight: 'bold', size: 'lg' },
            { type: 'text', text: `#${orderId}`, color: '#DDD', size: 'sm' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '💳 ชำระเงินผ่าน PromptPay', weight: 'bold', size: 'md' },
            { type: 'text', text: `ยอดที่ต้องชำระ: ฿${total.toFixed(0)}`, size: 'sm', color: '#E53935', weight: 'bold' },
            { type: 'text', text: `เบอร์รับโอน: ${promptPayNumber}`, size: 'sm', color: '#666' },
            { type: 'image', url: qrUrl, size: 'full', aspectMode: 'fit', margin: 'md' },
            {
              type: 'text',
              text: '⏱️ กรุณาชำระภายใน 15 นาที และส่งหลักฐานการโอน',
              wrap: true, size: 'xs', color: '#F57C00',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button', style: 'primary', color: '#1565C0',
            action: {
              type: 'postback',
              label: '📸 แจ้งชำระเงิน / ส่งสลิป',
              data: `action=confirm_payment&order_id=${orderId}`,
            },
          }],
        },
      },
    },
  ]);
}

/** รับการแจ้งชำระเงิน (รอรับสลิปจากลูกค้า) */
async function confirmPayment(userId, orderId, replyToken) {
  return lineClient.replyMessage(replyToken, {
    type: 'text',
    text: `📸 กรุณาถ่ายภาพสลิปการโอนเงิน แล้วส่งมาในแชทนี้เลยค่ะ\n\nออเดอร์ #${orderId}\n\nทีมงานจะตรวจสอบและยืนยันออเดอร์ภายใน 5 นาทีค่ะ 🙏`,
  });
}

/** รับภาพสลิป */
async function handleSlipImage(userId, messageId, replyToken) {
  // ดึง order ล่าสุดที่ pending_payment
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('line_user_id', userId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!order) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ไม่พบออเดอร์ที่รอชำระเงินค่ะ' });
  }

  // ดาวน์โหลดและอัปโหลดภาพ (หรือเก็บ LINE message ID ก็ได้)
  const slipUrl = `line://message_content/${messageId}`;

  await supabase.from('orders').update({
    status:         'paid',
    slip_image_url: slipUrl,
    updated_at:     new Date().toISOString(),
  }).eq('id', order.id);

  // แจ้งเตือนแอดมิน (ถ้ามี LINE Group/User ID ของแอดมิน)
  if (process.env.ADMIN_LINE_USER_ID) {
    await lineClient.pushMessage(process.env.ADMIN_LINE_USER_ID, {
      type: 'text',
      text: `🔔 ออเดอร์ใหม่ #${order.id}\n💰 ยอด: ฿${order.total_amount}\nลูกค้าส่งสลิปแล้ว กรุณาตรวจสอบค่ะ`,
    });
  }

  return lineClient.replyMessage(replyToken, [
    {
      type: 'text',
      text: `🎉 ขอบคุณค่ะ! ได้รับหลักฐานการชำระเงินแล้ว\n\n📋 ออเดอร์ #${order.id}\n\nทีมงานจะตรวจสอบและเริ่มเตรียมอาหารทันทีค่ะ 🍜`,
    },
    {
      type: 'flex',
      altText: 'สถานะออเดอร์',
      contents: buildOrderStatusCard(order.id, 'paid', order.total_amount),
    },
  ]);
}

// ─── Menu Browse ──────────────────────────────────────────────────────────────

async function showMenuCategories(userId, replyToken) {
  const categories = [
    { id: 'noodle', icon: '🍜', label: 'ก๋วยเตี๋ยว / เส้น', color: '#F57C00' },
    { id: 'rice',   icon: '🍳', label: 'ข้าว / อาหารจานเดียว', color: '#388E3C' },
    { id: 'salad',  icon: '🥗', label: 'ยำ / สลัด', color: '#0288D1' },
    { id: 'snack',  icon: '🥟', label: 'ของทานเล่น', color: '#7B1FA2' },
    { id: 'drink',  icon: '🧋', label: 'เครื่องดื่ม', color: '#C62828' },
  ];

  return lineClient.replyMessage(replyToken, {
    type: 'flex',
    altText: 'เลือกหมวดหมู่อาหาร',
    contents: {
      type: 'carousel',
      contents: categories.map(cat => ({
        type: 'bubble',
        size: 'micro',
        body: {
          type: 'box',
          layout: 'vertical',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cat.color + '15',
          contents: [
            { type: 'text', text: cat.icon, size: '3xl', align: 'center' },
            { type: 'text', text: cat.label, size: 'xs', align: 'center', wrap: true, weight: 'bold', color: cat.color },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'primary',
            color: cat.color,
            height: 'sm',
            action: {
              type: 'postback',
              label: 'ดูเมนู',
              data: `action=browse_category&category=${cat.id}`,
            },
          }],
        },
      })),
    },
  });
}

async function showMenuByCategory(userId, category, replyToken) {
  const { data: menus } = await supabase
    .from('menus')
    .select('*')
    .eq('category', category)
    .eq('available', true);

  if (!menus || menus.length === 0) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ไม่มีเมนูในหมวดนี้ค่ะ' });
  }

  return lineClient.replyMessage(replyToken, buildMenuCarousel(menus));
}

// ─── Flex Message Builders ────────────────────────────────────────────────────

function buildMenuCarousel(menus, title = null) {
  const bubbles = menus.map(m => ({
    type: 'bubble',
    hero: m.image_url ? {
      type: 'image',
      url: m.image_url,
      size: 'full',
      aspectRatio: '4:3',
      aspectMode: 'cover',
    } : undefined,
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: m.name, weight: 'bold', size: 'md', wrap: true },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `${m.calories} kcal`, size: 'xs', color: '#888', flex: 3 },
            {
              type: 'text',
              text: m.spicy_level === 0 ? '🌿 ไม่เผ็ด' : '🌶️'.repeat(m.spicy_level),
              size: 'xs',
              flex: 2,
              align: 'end',
            },
          ],
        },
        { type: 'text', text: m.description || '', size: 'xs', color: '#aaa', wrap: true },
        { type: 'separator', margin: 'sm' },
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          margin: 'sm',
          contents: [
            { type: 'text', text: `฿${m.price}`, size: 'xl', weight: 'bold', color: '#06C755', flex: 3 },
            {
              type: 'button',
              flex: 2,
              style: 'primary',
              color: '#06C755',
              height: 'sm',
              action: {
                type: 'postback',
                label: '+ เพิ่ม',
                data: `action=add_to_cart&menu_id=${m.id}&qty=1`,
              },
            },
          ],
        },
      ],
    },
  }));

  return {
    type: 'flex',
    altText: title || 'รายการเมนู',
    contents: { type: 'carousel', contents: bubbles },
  };
}

function buildOrderStatusCard(orderId, status, total) {
  const statusMap = {
    paid:             { text: 'ชำระเงินแล้ว', color: '#1565C0', icon: '💳' },
    preparing:        { text: 'กำลังเตรียมอาหาร', color: '#F57C00', icon: '👨‍🍳' },
    ready:            { text: 'อาหารพร้อมแล้ว', color: '#2E7D32', icon: '✅' },
    delivered:        { text: 'จัดส่งแล้ว', color: '#6A1B9A', icon: '🚗' },
    pending_payment:  { text: 'รอชำระเงิน', color: '#BF360C', icon: '⏳' },
  };
  const s = statusMap[status] || statusMap.pending_payment;

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: '📦 สถานะออเดอร์', weight: 'bold', size: 'sm', color: '#666' },
        { type: 'text', text: `#${orderId}`, weight: 'bold', size: 'md' },
        {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: s.color + '15',
          cornerRadius: '8px',
          paddingAll: '10px',
          margin: 'sm',
          contents: [
            { type: 'text', text: s.icon, size: 'lg', flex: 1 },
            { type: 'text', text: s.text, color: s.color, weight: 'bold', size: 'sm', flex: 5 },
          ],
        },
        { type: 'text', text: `ยอดรวม ฿${Number(total).toFixed(0)}`, size: 'sm', color: '#666', margin: 'sm' },
      ],
    },
  };
}

function buildWelcomeMessage() {
  return [
    {
      type: 'flex',
      altText: 'ยินดีต้อนรับสู่ร้านข้าวต้มนิดา',
      contents: {
        type: 'bubble',
        hero: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#06C755',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: '🍜', size: '3xl', align: 'center' },
            { type: 'text', text: 'ร้านข้าวต้มนิดา', color: '#FFF', weight: 'bold', size: 'xl', align: 'center' },
            { type: 'text', text: 'AI ช่วยแนะนำเมนูให้คุณ', color: '#DDD', size: 'sm', align: 'center' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'สวัสดีค่ะ! วันนี้อยากกินอะไรดีคะ?', wrap: true, size: 'md' },
            {
              type: 'text',
              text: '💬 บอก AI ได้เลยว่าต้องการแบบไหน เช่น "อยากกินอาหารไม่อ้วน" หรือ "ไม่กินเผ็ด"',
              wrap: true, size: 'sm', color: '#666', margin: 'sm',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button', style: 'primary', color: '#06C755',
              action: { type: 'message', label: '🤖 ให้ AI แนะนำเมนู', text: 'ช่วยแนะนำเมนูหน่อยค่ะ' },
            },
            {
              type: 'button', style: 'secondary',
              action: { type: 'postback', label: '📋 ดูเมนูทั้งหมด', data: 'action=browse_menu' },
            },
            {
              type: 'button', style: 'secondary',
              action: { type: 'postback', label: '🛒 ดูตะกร้าของฉัน', data: 'action=view_cart' },
            },
          ],
        },
      },
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOrderId() {
  const now   = new Date();
  const date  = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand  = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${date}-${rand}`;
}

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍜 LINE AI Food Bot running on port ${PORT}`);
});
