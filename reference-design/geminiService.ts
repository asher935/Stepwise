
import { GoogleGenAI } from "@google/genai";

// Fix: Directly use process.env.API_KEY as per coding guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const enhanceStepDescription = async (action: string, context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Improve this browser interaction description for a technical guide: "${action}". Context URL: ${context}. Keep it concise but professional.`,
    });
    return response.text?.trim() || action;
  } catch (e) {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }
};

export const summarizeGuide = async (steps: string[]) => {
  return { 
    title: "Local Guide Session", 
    description: `A sequence of ${steps.length} steps recorded in a private browser environment.` 
  };
};
