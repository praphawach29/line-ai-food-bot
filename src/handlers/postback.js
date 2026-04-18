'use strict';

const { lineClient, supabase } = require('../clients');
const cart  = require('../services/cart');
const order = require('../services/order');
const flex  = require('../builders/flex');

async function handlePostback(userId, data, replyToken) {
  const params = Object.fromEntries(new URLSearchParams(data));
  const { action } = params;

  switch (action) {
    case 'browse_menu':
      return lineClient.replyMessage(replyToken, flex.buildCategoryCarousel());

    case 'browse_category':
      return showMenuByCategory(params.category, replyToken);

    case 'add_to_cart':
      return cart.addToCart(userId, params.menu_id, parseInt(params.qty || '1'), replyToken);

    case 'view_cart':
      return cart.showCart(userId, replyToken);

    case 'remove_item':
      return cart.removeCartItem(userId, params.item_id, replyToken);

    case 'checkout':
      return order.startCheckout(userId, replyToken);

    case 'confirm_order':
      return order.confirmOrder(userId, replyToken);

    case 'confirm_payment':
      return order.confirmPayment(userId, params.order_id, replyToken);

    default:
      return lineClient.replyMessage(replyToken, { type: 'text', text: 'ขออภัยค่ะ ไม่เข้าใจคำสั่งนี้' });
  }
}

async function showMenuByCategory(category, replyToken) {
  const { lineClient: lc, supabase: sb } = require('../clients');
  const { data: menus } = await supabase
    .from('menus')
    .select('*')
    .eq('category', category)
    .eq('available', true);

  if (!menus || menus.length === 0) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ไม่มีเมนูในหมวดนี้ค่ะ' });
  }

  return lineClient.replyMessage(replyToken, flex.buildMenuCarousel(menus));
}

module.exports = { handlePostback };
