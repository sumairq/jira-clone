import { GoogleGenAI, Type } from '@google/genai';

import { CustomError } from 'errors';

const MODEL = 'gemini-2.5-flash';
const MAX_SUBTASKS = 12;
const MAX_SUBTASK_LENGTH = 200;

// Gemini supports an array root for structured output. We still re-validate the
// shape below — we never trust the raw model text.
const responseSchema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

const systemInstruction = [
  'You break a high-level software issue into a short checklist of concrete subtasks',
  'or acceptance criteria. Return 4 to 8 items. Each item is a single, actionable phrase',
  '(imperative mood, e.g. "Add a login form with email and password fields").',
  'Do not number the items, do not add markdown, and do not include any commentary —',
  'only the list of subtask strings.',
].join(' ');

let client: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  if (!process.env.GEMINI_API_KEY) {
    throw new CustomError(
      'AI is not configured. Set GEMINI_API_KEY on the server.',
      'AI_NOT_CONFIGURED',
      500,
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};

const buildPrompt = (title: string, descriptionText: string | null): string => {
  const lines = [`Issue title: ${title}`];
  if (descriptionText && descriptionText.trim()) {
    lines.push(`Issue description: ${descriptionText.trim()}`);
  }
  lines.push('Break this issue down into subtasks.');
  return lines.join('\n\n');
};

const parseSubtasks = (raw: string): string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CustomError(
      'The AI returned an unexpected response. Please try again.',
      'AI_GENERATION_FAILED',
      502,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new CustomError(
      'The AI returned an unexpected response. Please try again.',
      'AI_GENERATION_FAILED',
      502,
    );
  }

  const cleaned = parsed
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, MAX_SUBTASK_LENGTH))
    .filter(item => item.length > 0)
    .slice(0, MAX_SUBTASKS);

  if (cleaned.length === 0) {
    throw new CustomError(
      'The AI could not generate subtasks for this issue. Please try again.',
      'AI_GENERATION_FAILED',
      502,
    );
  }

  return cleaned;
};

export const generateSubtaskSuggestions = async (
  title: string,
  descriptionText: string | null,
): Promise<string[]> => {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(title, descriptionText),
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    throw new CustomError(
      'Failed to reach the AI service. Please try again.',
      'AI_REQUEST_FAILED',
      502,
    );
  }

  if (response.promptFeedback && response.promptFeedback.blockReason) {
    throw new CustomError(
      'The AI declined to generate subtasks for this issue.',
      'AI_GENERATION_FAILED',
      502,
    );
  }

  const text = response.text;
  if (!text) {
    throw new CustomError(
      'The AI returned an empty response. Please try again.',
      'AI_GENERATION_FAILED',
      502,
    );
  }

  return parseSubtasks(text);
};
