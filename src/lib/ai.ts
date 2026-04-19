import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import fs from 'fs';
import path from 'path';

export type AIChoice = 'gemini' | 'anthropic';

export interface AIRecommendation {
  intro: string;
  reason: string;
  menu_ids: string[];
  tips: string | null;
}

const getGeminiClient    = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const getAnthropicClient = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
};

export async function getAIRecommendation(userMessage: string, menuList: string): Promise<AIRecommendation> {
  let provider       = (process.env.AI_PROVIDER as AIChoice) || 'gemini';
  let storeName      = 'ร้านข้าวต้มนิดา';
  let botPrompt      = 'พนักงานเสิร์ฟมืออาชีพ เป็นกันเอง อบอุ่น รู้จักเมนูทุกอย่างในร้าน';
  let botGender      = 'female';
  let geminiModel    = 'gemini-2.5-flash';
  let anthropicModel = 'claude-3-5-sonnet-20240620';

  try {
    const p = path.join(process.cwd(), 'settings.json');
    if (fs.existsSync(p)) {
      const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (s.store_name)      storeName      = s.store_name;
      if (s.bot_prompt)      botPrompt      = s.bot_prompt;
      if (s.ai_provider)     provider       = s.ai_provider;
      if (s.gemini_model)    geminiModel    = s.gemini_model;
      if (s.anthropic_model) anthropicModel = s.anthropic_model;
      if (s.bot_gender)      botGender      = s.bot_gender;
    }
  } catch {}

  const tail = botGender === 'female' ? 'ค่ะ' : botGender === 'male' ? 'ครับ' : 'จ้า';
  const mid  = botGender === 'female' ? 'คะ'  : botGender === 'male' ? 'ครับ' : 'นะ';
  const soft = botGender === 'female' ? 'นะคะ': botGender === 'male' ? 'นะครับ': 'นะ';

  const systemPrompt = `คุณชื่อ "น้องนิดา" พนักงานต้อนรับร้าน ${storeName}
บุคลิก: ${botPrompt}
เพศ: ${botGender === 'female' ? 'ผู้หญิง' : botGender === 'male' ? 'ผู้ชาย' : 'เป็นกันเอง'}
หางเสียง: "${tail}" / "${mid}" / "${soft}" — ห้ามใช้หางเสียงผิดเพศเด็ดขาด

กฎการตอบ (สำคัญมาก):
- ข้อความรวมทั้งหมดต้องไม่เกิน 5 บรรทัดบนมือถือ
- intro: 1 ประโยคสั้นๆ รับรู้ความต้องการลูกค้า เป็นธรรมชาติ ไม่ทางการ
  ดีๆ: "อ๋อ ไม่อยากอ้วน${soft} เดี๋ยวเลือกให้เลย"
  ห้าม: "แน่นอน${tail}!" / "ยินดีให้บริการ${tail}!"
- reason: บรรยายเมนูสั้นๆ ไม่เกิน 2-3 บรรทัด ให้ได้กลิ่นอายรสชาติ
  ดีๆ: "ยำวุ้นเส้นรสจัดจ้าน เปรี้ยวนำ เผ็ดตาม เบาสบายไม่อ้วนเลย${tail}"
  ห้าม: อธิบายยาวเป็นหัวข้อหลายข้อ
- tips: 1 ประโยคสั้นๆ หรือ null ถ้าไม่จำเป็น
- ห้ามบอกว่าตัวเองเป็น AI

เมนูทั้งหมด:
${menuList}

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความนอก JSON:
{
  "intro": "...",
  "reason": "...",
  "menu_ids": ["M001"],
  "tips": "..." หรือ null
}`;

  if (provider === 'anthropic') {
    const client = getAnthropicClient();
    if (client) return callClaude(userMessage, systemPrompt, anthropicModel, client);
    console.warn('No Anthropic key, falling back to Gemini');
  }

  return callGemini(userMessage, systemPrompt, geminiModel, getGeminiClient());
}

async function callGemini(msg: string, system: string, model: string, client: GoogleGenAI): Promise<AIRecommendation> {
  const res = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: msg }] }],
    config: { systemInstruction: system, responseMimeType: 'application/json' }
  });
  try {
    return JSON.parse(res.text.replace(/```json|```/gi, '').trim());
  } catch (err) {
    console.error('Gemini parse error:', err);
    throw new Error('AI Response Malformed');
  }
}

async function callClaude(msg: string, system: string, model: string, client: Anthropic): Promise<AIRecommendation> {
  const res = await client.messages.create({
    model, max_tokens: 512,
    system,
    messages: [{ role: 'user', content: msg }],
  });
  try {
    const block = res.content[0];
    if (block.type !== 'text') throw new Error('Non-text response');
    return JSON.parse(block.text.replace(/```json|```/gi, '').trim());
  } catch (err) {
    console.error('Claude parse error:', err);
    throw new Error('AI Response Malformed');
  }
}
