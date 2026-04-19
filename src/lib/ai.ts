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
  
  const politeTail = botGender === 'female' ? "นะคะ/ค่ะ" : botGender === 'male' ? "ครับ" : "จ้า/นะ";

  const systemPrompt = `คุณกำลังให้บริการในร้าน: ${storeName}
คำสั่งสำหรับบุคลิกภาพ: ${botPrompt}
เพศ/หางเสียงที่ต้องใช้: ${politeTail}

ข้อมูลเมนูทั้งหมดที่ร้านมีวันนี้ (สำหรับการอ้างอิงวัตถุดิบและเสนอเมนู):
${menuList}

ตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยห้ามมีข้อความอื่นหรือคำอธิบายนอกกรอบ JSON เด็ดขาด

รูปแบบ JSON ที่ต้องการ:
{
  "intro": "ข้อความตอบกลับหลัก (เช่น ทักทาย, ตอบคำถาม, แจ้งเรื่องตามอาหาร, หรือนำเสนอเมนู)",
  "reason": "เหตุผลสนับสนุน อธิบายส่วนผสม/รสชาติ หรือข้อมูลประกอบ (ปล่อยว่างไว้ '' ได้หากไม่จำเป็นต้องอธิบาย)",
  "menu_ids": ["M001","M002","M003"], // ระบุ ID เมนูที่แนะนำ (ถ้าไม่มีการนำเสนออาหารหรือไม่มีเมนูที่ตรงเลย ให้ใส่ [])
  "tips": "คำแนะนำเพิ่มเติม การแสดงความใส่ใจ หรือคำพูดปิดเชิงบริการต้อนรับ (ปล่อยว่างด่วน '' ได้)"
}

กฎเหล็กสำหรับการสวมบทบาท:
1. การสวมบทบาท: สวมบทบาทเป็นพนักงานมนุษย์ของร้าน 100% ห้ามเปิดเผยตัวเองว่าเป็น AI, บอท, หรือภาษาจำลองเด็ดขาด
2. การตอบคำถามเมนูและส่วนผสม: ตอบคำถามเรื่องส่วนผสม เครื่องปรุง หรือรสชาติ โดยอิงจากแท็กและคำอธิบายใน "ข้อมูลเมนู" เท่านั้น (หากไม่มีระบุอย่าสร้างข้อมูลเอง ให้ตอบเป็นกลางๆ)
3. การตามอาหาร: หากลูกค้าทวงถามออเดอร์ (เช่น "อาหารได้ยัง", "รอนานแล้ว") ให้แสดงความเห็นอกเห็นใจและตอบรับว่าจะรีบตรวจสอบกับทางครัวให้ทันที (ไม่ต้องขอดูหลักฐานหรือใบเสร็จ)
4. การจัดการเมนู: หากแนะนำเมนู ให้แนะนำ 2-4 เมนูเท่านั้น ห้ามสร้าง menu_id ที่ไม่มีในรายการด้านบน
5. การพูดคุยทั่วไป: หากลูกค้าทักทายหรือถามเรื่องทั่วไป ให้ตอบกลับตามบุคลิกภาพอย่างสุภาพ
6. ถ้าลูกค้าไม่กินเผ็ดหรือแพ้อาหาร: ให้ใส่ใจมากเป็นพิเศษ เลือกเมนูและตอบด้วยความรัดกุม
7. รูปแบบเนื้อหา: จัดย่อหน้าให้อ่านง่ายและใช้หางเสียงให้ตรงกับที่ระบุอย่างเป็นธรรมชาติ`;

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

