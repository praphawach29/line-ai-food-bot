'use strict';

const { lineClient, supabase } = require('../clients');
const flex = require('../builders/flex');

async function handleSlipImage(userId, messageId, replyToken) {
  // ดึง order ล่าสุดที่ยังรอชำระเงิน
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('line_user_id', userId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!order) {
    return lineClient.replyMessage(replyToken, {
      type: 'text',
      text: 'ไม่พบออเดอร์ที่รอชำระเงินค่ะ',
    });
  }

  // บันทึก LINE message ID ของสลิปไว้
  const slipUrl = `line://message_content/${messageId}`;

  await supabase.from('orders').update({
    status:         'paid',
    slip_image_url: slipUrl,
    updated_at:     new Date().toISOString(),
  }).eq('id', order.id);

  // แจ้งเตือนแอดมิน
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
      contents: flex.buildOrderStatusCard(order.id, 'paid', order.total_amount),
    },
  ]);
}

module.exports = { handleSlipImage };
