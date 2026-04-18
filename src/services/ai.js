'use strict';

const { lineClient, claude, supabase } = require('../clients');
const flex = require('../builders/flex');

async function handleAIRecommendation(userId, userMessage, replyToken) {
  // ตอบก่อนว่ากำลังคิด (replyToken ใช้ได้แค่ครั้งเดียว)
  await lineClient.replyMessage(replyToken, {
    type: 'text',
    text: '🤖 AI กำลังคิดเมนูที่เหมาะกับคุณ...',
  });

  // ดึงเมนูทั้งหมดที่เปิดขาย
  const { data: menus } = await supabase
    .from('menus')
    .select('*')
    .eq('available', true);

  const menuList = menus.map(m =>
    `ID:${m.id} | ${m.name} | ราคา ฿${m.price} | ${m.calories}kcal | เผ็ด:${m.spicy_level}/3 | เจ:${m.is_vegan} | tags:${m.tags.join(',')}`
  ).join('\n');

  // เรียก Claude
  const response = await claude.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `คุณเป็นผู้ช่วย AI ของร้านอาหารชื่อ "ร้านข้าวต้มนิดา" ช่วยแนะนำเมนูตามความต้องการของลูกค้า
ตอบกลับเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายนอก JSON

รูปแบบ JSON ที่ต้องการ:
{
  "intro": "ข้อความแนะนำสั้น ๆ อบอุ่น 1-2 ประโยค",
  "reason": "อธิบายว่าทำไมถึงแนะนำเมนูเหล่านี้",
  "menu_ids": ["M001","M002","M003"],
  "tips": "เคล็ดลับเพิ่มเติม (ถ้าไม่มีให้เป็น null)"
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
    aiResult  = JSON.parse(raw);
  } catch {
    return lineClient.pushMessage(userId, {
      type: 'text',
      text: 'ขออภัยค่ะ AI ขัดข้องชั่วคราว กรุณาลองใหม่ หรือกด "ดูเมนูทั้งหมด" ค่ะ',
    });
  }

  const recommended = menus.filter(m => aiResult.menu_ids.includes(m.id));
  const messages    = [];

  messages.push({
    type: 'text',
    text: `✨ ${aiResult.intro}\n\n💡 ${aiResult.reason}${aiResult.tips ? '\n\n🍃 ' + aiResult.tips : ''}`,
  });

  if (recommended.length > 0) {
    messages.push(flex.buildMenuCarousel(recommended, 'เมนูแนะนำโดย AI สำหรับคุณ'));
  }

  messages.push({
    type: 'text',
    text: 'ต้องการอะไรเพิ่มไหมคะ?',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '🛒 ดูตะกร้า',      data: 'action=view_cart' } },
        { type: 'action', action: { type: 'message',  label: '📋 ดูเมนูทั้งหมด', text: 'ดูเมนูทั้งหมด' } },
        { type: 'action', action: { type: 'message',  label: '🔄 ถามใหม่',        text: 'เริ่มใหม่' } },
      ],
    },
  });

  return lineClient.pushMessage(userId, messages);
}

module.exports = { handleAIRecommendation };
