import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as line from '@line/bot-sdk';
import path from 'path';
import dotenv from 'dotenv';
import { handleEvent } from './src/lib/webhook';

dotenv.config();

const app = express();
const PORT = 3000;

// LINE Config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

// Webhook route - MUST be before any body-parser middleware if using line.middleware
// Note: line.middleware handles the validation and automatic parsing of the body
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  console.log('--- Incoming Webhook Event ---');
  try {
    const events: any[] = req.body.events;
    
    // Process all events in parallel
    const results = await Promise.all(
      events.map(event => {
        console.log(`Processing event: ${event.type} from ${event.source.userId}`);
        return handleEvent(event);
      })
    );

    res.json(results);
  } catch (err) {
    console.error('Webhook Error:', err);
    res.status(500).end();
  }
});

// JSON middleware for other API routes
app.use(express.json());

// API health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    ai_provider: process.env.AI_PROVIDER || 'gemini'
  });
});

// Vite middleware setup
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
    console.log(`📡 Webhook URL: ${process.env.APP_URL || 'http://localhost:3000'}/webhook`);
  });
}

setupVite().catch(console.error);
