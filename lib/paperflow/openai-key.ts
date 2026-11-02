/**
 * The server's OpenAI key. Read from OPENAI_API_KEY, or from OPEN_AI_API_NEW_KEY, the name the
 * replacement key was saved under on Vercel when the first one expired.
 */
export const openaiKey = () => process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_NEW_KEY || "";
