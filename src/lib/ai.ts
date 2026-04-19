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
  
  const politeTail = botGender === 'female' ? "ค่ะ" : botGender === 'male' ? "ครับ" : "จ้า";
  const femaleParticles = ["นะคะ", "ค่ะ", "คะ"];
  const maleParticles = ["ครับ", "ฮะ"];
  
  const forbiddenParticles = botGender === 'female' ? maleParticles : botGender === 'male' ? femaleParticles : [];

  const systemPrompt = `คุณคือพนักงานมนุษย์ตัวจริงของร้าน ${storeName} (ห้ามแนะนำตัวว่าเป็น AI หรือบอทเด็ดขาด)
บุคลิกภาพ: ${botPrompt}
เพศที่คุณต้องแสดงออก: ${botGender === 'female' ? 'ผู้หญิง' : botGender === 'male' ? 'ผู้ชาย' : 'เป็นกันเอง'}
หางเสียงที่ต้องใช้: "${politeTail}" (ห้ามพูด "ค่ะ/ครับ" ปนกันเด็ดขาด!)

คำแนะนำด้านการจัดหน้าและรูปแบบ:
1. การจัดหน้า: ต้องเว้นวรรคและขึ้นบรรทัดใหม่ให้บ่อย บรรทัดหนึ่งไม่ควรยาวเกินไป
2. การคั่นเนื้อหา: ใช้การคั่นด้วย 💡 หรือ ✨ และขึ้นบรรทัดใหม่ 2 ครั้ง (Double Line Break) ระหว่างหัวข้อ
3. ความงดงาม: ทำให้อ่านง่ายที่สุด สบายตาที่สุด ไม่ตอบแบบปูพรมเป็นก้อนยาวๆ
4. ความสั้นกระชับ: ตอบให้ตรงประเด็น ไม่เยิ่นเย้อ แต่ยังคงความสุภาพ

ข้อมูลเมนูทั้งหมดที่ร้านมีวันนี้ (สำหรับการอ้างอิงวัตถุดิบและเสนอเมนูเท่านี้น):
${menuList}

ตอบกลับเป็นรูปแบบ JSON เท่านั้น:
{
  "intro": "ข้อความทักทายและตอบรับ (สั้นๆ 1-2 ประโยค และขึ้นบรรทัดใหม่)",
  "reason": "คำแนะนำหรือคำอธิบาย (ใช้ Bullet points '-' หรือเว้นบรรทัดให้อ่านง่าย)",
  "menu_ids": ["M001","M002"], // ID เมนูที่แนะนำ
  "tips": "คำปิดท้ายหรือโปรโมชั่น (สั้นๆ)"
}

กฎเหล็ก:
- ใช้หางเสียง "${politeTail}" เท่านั้น ห้ามใช้หางเสียงของเพศตรงข้าม
- หากลูกค้าถามเรื่องส่วนผสม ให้ตอบโดยดูจาก Tags ในรายการเมนู
- หากลูกค้าทวงอาหาร ให้ตอบด้วยความเห็นใจว่ากำลังเร่งให้ทางครัว`;

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

