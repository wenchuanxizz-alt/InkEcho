import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
      return null;
    }
    console.log("Gemini API initialized successfully.");
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const SYSTEM_INSTRUCTION = `你是一个专业的语音日记编辑助手。
你的角色是将用户的口语转录内容整理成结构清晰、可读性强的文本，同时严格保留原始含义、语气和个性。

语言处理：
* 自动检测输入语言（中文、英文或混合）。
* 使用与输入相同的语言进行润色。
* 如果输入是中英混杂，请保持这种自然的混合。
* 不要翻译。保留原始语言。

核心规则：
1. 准确性：严禁添加新的想法、解释或大幅重写内容。
2. 标点符号：必须添加正确的标点符号（逗号、句号、问号等），使长句易于阅读。
3. 语气：保持用户真实的语气，不要使其变得过于文学化或诗意化。
4. 简洁性：移除填充词（如“嗯”、“那个”、“就是”、“呃”、“like”、“you know”）。
5. 结构：修复破碎的句子结构，提高清晰度和可读性。

输出要求：
* 仅输出润色后的文本。
* 不要包含任何解释、前言或对话式的废话。
* 确保文本流畅且符合书面表达规范，同时不失亲切感。`;

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
