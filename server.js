'use strict';
require('dotenv').config();

const express = require('express');
const line    = require('@line/bot-sdk');
const path    = require('path');

const { lineConfig }              = require('./src/clients');
const { handleTextMessage }       = require('./src/handlers/message');
const { handlePostback }          = require('./src/handlers/postback');
const { handleSlipImage }         = require('./src/handlers/image');

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

 /webhook ต้องใช้ raw body สำหรับ LINE signature verification
 route อื่น ๆ ใช้ express.json() ปกติ

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ─── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  res.status(200).end(); // ตอบ LINE กลับทันที
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

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍜 LINE AI Food Bot running on port ${PORT}`);
});
