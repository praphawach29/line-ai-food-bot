'use strict';

// ─── Welcome Message ──────────────────────────────────────────────────────────
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

// ─── Menu Carousel ────────────────────────────────────────────────────────────
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

// ─── Menu Category Bubbles ────────────────────────────────────────────────────
function buildCategoryCarousel() {
  const categories = [
    { id: 'noodle', icon: '🍜', label: 'ก๋วยเตี๋ยว / เส้น',      color: '#F57C00' },
    { id: 'rice',   icon: '🍳', label: 'ข้าว / อาหารจานเดียว',   color: '#388E3C' },
    { id: 'salad',  icon: '🥗', label: 'ยำ / สลัด',              color: '#0288D1' },
    { id: 'snack',  icon: '🥟', label: 'ของทานเล่น',             color: '#7B1FA2' },
    { id: 'drink',  icon: '🧋', label: 'เครื่องดื่ม',             color: '#C62828' },
  ];

  return {
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
  };
}

// ─── Cart Bubble ──────────────────────────────────────────────────────────────
function buildEmptyCartBubble() {
  return {
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
  };
}

function buildCartBubble(items, total) {
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
            type: 'button', height: 'sm', style: 'link', color: '#E53935',
            action: { type: 'postback', label: 'ลบ', data: `action=remove_item&item_id=${i.id}` },
          },
        ],
      },
    ],
  }));

  const rowsWithSep = itemRows.reduce((acc, row, idx) => {
    acc.push(row);
    if (idx < itemRows.length - 1) acc.push({ type: 'separator', margin: 'sm', color: '#F0F0F0' });
    return acc;
  }, []);

  return {
    type: 'flex',
    altText: `ตะกร้าของคุณ — รวม ฿${total.toFixed(0)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        contents: [{ type: 'text', text: '🛒 ตะกร้าของคุณ', color: '#FFFFFF', weight: 'bold', size: 'lg' }],
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
          { type: 'text', text: 'ราคาดังกล่าวยังไม่รวมค่าจัดส่ง', color: '#AAA', size: 'xxs', align: 'end' },
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
  };
}

function buildAddedToCartBubble(menuName, menuPrice, qty, itemCount) {
  return {
    type: 'flex',
    altText: `เพิ่ม ${menuName} ลงตะกร้าแล้ว`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '✅ เพิ่มลงตะกร้าแล้ว', weight: 'bold', color: '#06C755', size: 'sm' },
          { type: 'text', text: menuName, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: `฿${menuPrice} × ${qty}`, color: '#666', size: 'sm' },
          { type: 'text', text: `ตะกร้าของคุณมี ${itemCount} รายการ`, color: '#999', size: 'xs', margin: 'md' },
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
  };
}

// ─── Checkout / Order Bubbles ─────────────────────────────────────────────────
function buildCheckoutSummaryBubble(items, total) {
  const itemLines = items
    .map(i => `• ${i.menus.name} ×${i.quantity} = ฿${(i.unit_price * i.quantity).toFixed(0)}`)
    .join('\n');

  return {
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
          { type: 'text', text: itemLines, wrap: true, size: 'sm', color: '#333' },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ยอดรวม', weight: 'bold', size: 'md' },
              { type: 'text', text: `฿${total.toFixed(0)}`, weight: 'bold', size: 'xl', color: '#E53935', align: 'end' },
            ],
          },
          { type: 'text', text: '⚠️ หลังยืนยันแล้ว ไม่สามารถแก้ไขออเดอร์ได้', wrap: true, size: 'xxs', color: '#F57C00', margin: 'md' },
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
  };
}

function buildConfirmOrderBubble(orderId, total, promptPayNumber, qrUrl) {
  return {
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
          { type: 'text', text: '⏱️ กรุณาชำระภายใน 15 นาที และส่งหลักฐานการโอน', wrap: true, size: 'xs', color: '#F57C00' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button', style: 'primary', color: '#1565C0',
          action: { type: 'postback', label: '📸 แจ้งชำระเงิน / ส่งสลิป', data: `action=confirm_payment&order_id=${orderId}` },
        }],
      },
    },
  };
}

function buildOrderStatusCard(orderId, status, total) {
  const statusMap = {
    paid:            { text: 'ชำระเงินแล้ว',       color: '#1565C0', icon: '💳' },
    preparing:       { text: 'กำลังเตรียมอาหาร',   color: '#F57C00', icon: '👨‍🍳' },
    ready:           { text: 'อาหารพร้อมแล้ว',      color: '#2E7D32', icon: '✅' },
    delivered:       { text: 'จัดส่งแล้ว',          color: '#6A1B9A', icon: '🚗' },
    pending_payment: { text: 'รอชำระเงิน',          color: '#BF360C', icon: '⏳' },
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

module.exports = {
  buildWelcomeMessage,
  buildMenuCarousel,
  buildCategoryCarousel,
  buildEmptyCartBubble,
  buildCartBubble,
  buildAddedToCartBubble,
  buildCheckoutSummaryBubble,
  buildConfirmOrderBubble,
  buildOrderStatusCard,
};
