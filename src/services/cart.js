'use strict';

const { lineClient, supabase }  = require('../clients');
const flex                      = require('../builders/flex');

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Add to Cart ──────────────────────────────────────────────────────────────
async function addToCart(userId, menuId, qty, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, price')
    .eq('id', menuId)
    .single();

  if (!menu) {
    return lineClient.replyMessage(replyToken, { type: 'text', text: 'ไม่พบเมนูนี้ค่ะ' });
  }

  const { data: existing } = await supabase
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart.id)
    .eq('menu_id', menuId)
    .single();

  if (existing) {
    await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + qty })
      .eq('id', existing.id);
  } else {
    await supabase.from('cart_items').insert({
      cart_id:    cart.id,
      menu_id:    menuId,
      quantity:   qty,
      unit_price: menu.price,
    });
  }

  const { count } = await supabase
    .from('cart_items')
    .select('*', { count: 'exact' })
    .eq('cart_id', cart.id);

  return lineClient.replyMessage(replyToken,
    flex.buildAddedToCartBubble(menu.name, menu.price, qty, count)
  );
}

// ─── Show Cart ────────────────────────────────────────────────────────────────
async function showCart(userId, replyToken) {
  const cart = await getOrCreateCart(userId);

  const { data: items } = await supabase
    .from('cart_items')
    .select('*, menus(name, price, image_url)')
    .eq('cart_id', cart.id);

  if (!items || items.length === 0) {
    return lineClient.replyMessage(replyToken, flex.buildEmptyCartBubble());
  }

  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  return lineClient.replyMessage(replyToken, flex.buildCartBubble(items, total));
}

// ─── Remove Cart Item ─────────────────────────────────────────────────────────
async function removeCartItem(userId, itemId, replyToken) {
  await supabase.from('cart_items').delete().eq('id', itemId);
  return showCart(userId, replyToken);
}

module.exports = { getOrCreateCart, addToCart, showCart, removeCartItem };
