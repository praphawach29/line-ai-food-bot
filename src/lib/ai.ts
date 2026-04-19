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
  let botPrompt = 'คุณคือพนักงานเสิร์ฟและผู้ช่วยแนะนำเมนูอาหารมืออาชีพประจำ "ร้านข้าวต้มนิดา"\\nบุคลิกของคุณ: สุภาพ เป็นมิตร กระตือรือร้น เต็มใจบริการ และมีความรู้เรื่องอาหารในร้านเป็นอย่างดี';
  
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
    }
  } catch(e) {}
  
  const systemPrompt = `คุณกำลังให้บริการในร้าน: ${storeName}
คำสั่งสำหรับบุคลิกภาพ: ${botPrompt}

ตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยห้ามมีข้อความอื่นหรือคำอธิบายนอกกรอบ JSON เด็ดขาด

รูปแบบ JSON ที่ต้องการ:
{
  "intro": "ข้อความต้อนรับและแนะนำสั้นๆ ด้วยความสุภาพและเป็นมิตร เช่น 'สวัสดีค่ะ/ครับ ยินดีต้อนรับค่ะ วันนี้รับเป็นเมนูไหนดีคะ? ทางเราขอแนะนำ...'",
  "reason": "อธิบายถึงความพิเศษ รสชาติ หรือความน่าทานของเมนูที่คุณเลือก เพื่อกระตุ้นความน่าสนใจ",
  "menu_ids": ["M001","M002","M003"],
  "tips": "คำแนะนำเพิ่มเติมหรือทริคในการทาน (ถ้ามี) หรือคำพูดปิดเชิงบริการต้อนรับ"
}

กฎเหล็ก:
- ทักทายและตอบกลับอย่างสุภาพเสมอตาม System Prompt ด้านบน
- แนะนำ 2-4 เมนูเท่านั้น เพื่อไม่ให้ลูกค้าสับสน
- เลือกจาก menu_ids ที่มีในรายการด้านล่างเท่านั้น ห้ามสร้างเมนูขึ้นมาเอง
- ถ้าลูกค้าไม่กินเผ็ด ให้เลือกเมนูที่ spicy_level=0 เท่านั้น พร้อมอธิบายด้วยความใส่ใจ
- ถ้าลูกค้ากินเจ ให้เลือกเมนูที่ is_vegan=true เท่านั้น
- ถ้าลูกค้าอยากคุมอาหาร/ลดน้ำหนัก ให้เลือกเมนูที่ calories < 300 เท่านั้น พร้อมบอกจุดเด่นว่าดีต่อสุขภาพ

รายการเมนูทั้งหมดที่ร้านมีวันนี้:
${menuList}`;

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

