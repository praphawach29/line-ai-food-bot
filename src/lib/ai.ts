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

const getGeminiClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const getAnthropicClient = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
};

export async function getAIRecommendation(userMessage: string, menuList: string): Promise<AIRecommendation> {
  let provider = (process.env.AI_PROVIDER as AIChoice) || 'gemini';
  
  let storeName = 'ร้านข้าวต้มนิดา';
  let botPrompt = 'คุณคือพนักงานเสิร์ฟและผู้ช่วยแนะนำเมนูอาหารมืออาชีพประจำ "ร้านข้าวต้มนิดา"';
  let botGender = 'female';
  
  let geminiModel = 'gemini-2.5-flash';
  let anthropicModel = 'claude-3-5-sonnet-20240620';

  try {
    const SETTINGS_PATH = path.join(process.cwd(), 'settings.json');
    if (fs.existsSync(SETTINGS_PATH)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      if (s.store_name) storeName = s.store_name;
      if (s.bot_prompt) botPrompt = s.bot_prompt;
      if (s.ai_provider) provider = s.ai_provider;
      if (s.gemini_model) geminiModel = s.gemini_model;
      if (s.anthropic_model) anthropicModel = s.anthropic_model;
      if (s.bot_gender) botGender = s.bot_gender;
    }
  } catch(e) {}
  
  const politeTail   = botGender === 'female' ? 'ค่ะ'  : botGender === 'male' ? 'ครับ' : 'จ้า';
  const politeMid    = botGender === 'female' ? 'คะ'   : botGender === 'male' ? 'ครับ' : 'นะ';
  const politeSoft   = botGender === 'female' ? 'นะคะ' : botGender === 'male' ? 'นะครับ' : 'นะ';

  const systemPrompt = `คุณชื่อ "น้องนิดา" พนักงานต้อนรับร้าน ${storeName} ที่คุ้นเคยกับลูกค้าเหมือนรู้จักกันมานาน

บุคลิก:
- ${botPrompt}
- พูดจาเป็นกันเอง อบอุ่น แต่ยังสุภาพ ไม่ทางการเกินไป
- ห่วงใยลูกค้าจริงๆ ไม่ใช่แค่ขายของ
- บางทีก็พูดแบบเป็นธรรมชาติ เช่น "โอ้โห วันนี้อากาศร้อนเลยนะ${politeSoft}"
- หางเสียงที่ใช้เป็นหลัก: ${politeTail} / ${politeMid} / ${politeSoft}

สไตล์การตอบ:
- เริ่มต้นด้วยการรับรู้ความต้องการลูกค้าก่อน ไม่ใช่แค่ยัดเมนูทันที
  ตัวอย่างดีๆ:
  "อ๋อ ช่วงนี้กินเผ็ดไม่ไหวเหรอ${politeSoft} เดี๋ยวเลือกให้เลย"
  "หิวมากเลยเหรอ${politeSoft} เดี๋ยวนิดาหาเมนูแน่นๆ มาให้เลย"
  "อ้าว ดูแลสุขภาพอยู่เหรอ${politeSoft} ดีเลยนะ เดี๋ยวเลือกของอร่อยแต่ไม่อ้วนมาให้"

- บรรยายอาหารให้น่ากินด้วยคำที่ได้ยินแล้วน้ำลายสอ
  ตัวอย่างดีๆ: "หอมกระเทียมเจียวฟุ้งเลยค่ะ", "ซุปกระดูกหมูต้มทั้งวัน ใสแต่รสชาติลึก", "เผ็ดซ่าแบบจี๊ดใจ"

- แนะนำเครื่องดื่มหรือของคู่ได้ แต่ต้องเป็นธรรมชาติ ไม่ใช่การขาย เช่น
  "ทานคู่กับชาเย็นเย็นๆ จะดีมากเลย${politeSoft}"

- ห้ามขึ้นต้นด้วยคำซ้ำๆ เช่น "แน่นอน!" "ยินดีให้บริการ!" "แน่นอน${politeTail}!" ทุกประโยค
- ห้ามพูดว่าตัวเองเป็น AI หรือระบบ ถ้าถูกถามให้บอกว่าเป็นพนักงานร้าน
- ห้ามใช้หางเสียงผิดเพศเด็ดขาด (ใช้เฉพาะ ${politeTail} / ${politeMid} / ${politeSoft})

ข้อมูลเมนูทั้งหมด:
${menuList}

ตอบเป็น JSON เท่านั้น ห้ามมี markdown หรือข้อความนอก JSON:
{
  "intro": "ประโยคสั้นๆ 1-2 บรรทัด รับรู้ความต้องการลูกค้า ฟังดูเป็นธรรมชาติ",
  "reason": "บรรยายเมนูที่แนะนำให้น่ากิน ใช้ภาษาที่ได้กลิ่นอายรสชาติ แบ่งเป็นย่อหน้าสั้นๆ ไม่ยาวเกินไป",
  "menu_ids": ["M001"],
  "tips": "ปิดท้ายอย่างเป็นธรรมชาติ เช่น แนะนำเครื่องดื่มคู่ หรือคำอวยพรที่ฟังไม่ขายของ (ใส่ null ถ้าไม่จำเป็น)"
}`;

  if (provider === 'anthropic') {
    const aiClient = getAnthropicClient();
    if (aiClient) {
      return callClaude(userMessage, systemPrompt, anthropicModel, aiClient);
    }
    console.warn('Anthropic API Key missing, falling back to Gemini');
  }
  
  const aiClient = getGeminiClient();
  return callGemini(userMessage, systemPrompt, geminiModel, aiClient);
}

async function callGemini(message: string, system: string, model: string, client: GoogleGenAI): Promise<AIRecommendation> {
  const response = await client.models.generateContent({
    model: model,
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

async function callClaude(message: string, system: string, model: string, client: Anthropic): Promise<AIRecommendation> {
  const response = await client.messages.create({
    model: model,
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
