import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export type AIChoice = 'gemini' | 'anthropic';

export interface AIRecommendation {
  intro: string;
  reason: string;
  menu_ids: string[];
  tips: string | null;
}

const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const anthropicAI = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function getAIRecommendation(userMessage: string, menuList: string): Promise<AIRecommendation> {
  const provider = (process.env.AI_PROVIDER as AIChoice) || 'gemini';
  
  const systemPrompt = `คุณเป็นผู้ช่วย AI ของร้านอาหารชื่อ "ร้านข้าวต้มนิดา" ช่วยแนะนำเมนูตามความต้องการของลูกค้า
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
${menuList}`;

  if (provider === 'anthropic' && anthropicAI) {
    return callClaude(userMessage, systemPrompt);
  } else {
    return callGemini(userMessage, systemPrompt);
  }
}

async function callGemini(message: string, system: string): Promise<AIRecommendation> {
  const response = await geminiAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
    }
  });

  try {
    const rawText = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
  } catch (err) {
    console.error('Gemini JSON Parse Error:', err, response.text);
    throw new Error('AI Response Malformed');
  }
}

async function callClaude(message: string, system: string): Promise<AIRecommendation> {
  if (!anthropicAI) throw new Error('Anthropic API Key missing');

  const response = await anthropicAI.messages.create({
    model: 'claude-3-5-sonnet-20240620', // Using a stable model name
    max_tokens: 1024,
    system: system,
    messages: [{ role: 'user', content: message }],
  });

  try {
    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Non-text response from Claude');
    const rawText = content.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
  } catch (err) {
    console.error('Claude JSON Parse Error:', err);
    throw new Error('AI Response Malformed');
  }
}
