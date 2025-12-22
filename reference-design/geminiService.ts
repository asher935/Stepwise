
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const enhanceStepDescription = async (action: string, context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are an expert technical writer. Turn this raw browser action: "${action}" into a clear, professional, and instructional step for a software guide. Context of the page: ${context}. Return only the improved text.`,
      config: {
        temperature: 0.7,
      }
    });
    return response.text || action;
  } catch (error) {
    console.error("Gemini Error:", error);
    return action;
  }
};

export const summarizeGuide = async (steps: string[]) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Summarize these browser automation steps into a concise, catchy title and a 1-sentence description: ${steps.join(', ')}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["title", "description"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return { title: "Untitled Guide", description: "Recorded browser session." };
  }
};
