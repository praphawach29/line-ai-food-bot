'use strict';
require('dotenv').config();

const line              = require('@line/bot-sdk');
const Anthropic         = require('@anthropic-ai/sdk');
const { createClient }  = require('@supabase/supabase-js');

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

module.exports = { lineConfig, lineClient, claude, supabase };
