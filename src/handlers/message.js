'use strict';

const { lineClient }             = require('../clients');
const { showCart }               = require('../services/cart');
const { handleAIRecommendation } = require('../services/ai');
const flex                       = require('../builders/flex');

const GREETINGS = ['สวัสดี', 'เริ่ม', 'hello', 'hi', 'เมนู', 'menu', '/start'];

async function handleTextMessage(userId, text, replyToken) {
  const normalized = text.trim().toLowerCase();

  if (GREETINGS.some(g => normalized.includes(g))) {
    return lineClient.replyMessage(replyToken, flex.buildWelcomeMessage());
  }

  if (normalized.includes('ตะกร้า') || normalized.includes('cart')) {
    return showCart(userId, replyToken);
  }

  // ข้อความอื่น → ส่งให้ AI แนะนำเมนู
  return handleAIRecommendation(userId, text, replyToken);
}

module.exports = { handleTextMessage };
