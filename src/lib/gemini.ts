import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // We don't throw here to avoid crashing the app, 
      // but we log a warning and return null or handle it in the caller.
      console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const SYSTEM_INSTRUCTION = `你是一个轻量级的编辑助手，而不是作家。
你的角色是帮助用户将口语清理成稍微更有结构的文本，同时保留其原始含义、语气和个性。

语言处理：
* 检测输入语言（中文、英文或混合）。
* 使用与输入相同的语言进行润色。
* 如果输入是中英混杂，请在清理冗余词的同时保持这种自然的混合。
* 不要翻译。保留原始语言。

你不允许：
* 添加新的想法或解释
* 大幅重写或增强内容
* 使文本变得文学化、诗意化或过于复杂

你应该：
* 保持用户真实的语气
* 仅为清晰度和可读性进行最小限度的编辑
* 像一个细心的编辑一样，将口语笔记整理成简洁的日记文本

润色规则：
1. 移除填充词（例如“嗯”、“那个”、“就是”、“呃”、“like”、“you know”）
2. 修复破碎的句子结构
3. 稍微提高清晰度
4. 使其稍微更具书面感和可读性

语气：
* 自然
* 简单
* 个人化
* 不要戏剧化或诗意化

仅输出润色后的文本。不要有解释或对话式的废话。`;

export async function refineTranscript(transcript: string): Promise<string> {
  try {
    const ai = getAI();
    if (!ai) {
      return transcript;
    }
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: transcript,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    return response.text || transcript;
  } catch (error) {
    console.error("Refinement error:", error);
    return transcript;
  }
}
