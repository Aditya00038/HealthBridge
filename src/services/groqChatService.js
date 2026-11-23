import { INDIAN_HEALTHCARE_DATA } from './indianHealthcareData';
import { getFacilitiesByCity, getAvailableCities } from './locationServices';

export const getGroqApiKey = () => {
  const envKey = 
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_GROQ_API || import.meta.env.GROQ_API)) ||
    (typeof process !== 'undefined' && process.env && (process.env.VITE_GROQ_API || process.env.GROQ_API)) ||
    '';
  return (envKey && envKey.trim()) || '';
};

// Available Groq chat models in prioritized order
export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b'
];

/**
 * Build concise healthcare system prompt
 */
export const buildSystemPrompt = (userCity = null) => {
  // Extract top hospitals across cities from INDIAN_HEALTHCARE_DATA
  const cities = ['pune', 'mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'kolkata', 'ahmedabad'];
  const citySummaries = cities.map(cityKey => {
    const facilities = INDIAN_HEALTHCARE_DATA[cityKey] || [];
    const hospitals = facilities.filter(f => f.type === 'hospital').slice(0, 3);
    if (!hospitals.length) return '';
    const hospitalList = hospitals
      .map(h => `- ${h.name} (${h.specialty}): ${h.address}, Phone: ${h.phone}`)
      .join('\n');
    const cityName = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
    return `${cityName}:\n${hospitalList}`;
  }).filter(Boolean).join('\n\n');

  return `You are HealthBridge AI, a concise and precise clinical healthcare assistant.

RULES:
1. EXTREME BREVITY (MANDATORY):
   - Keep answers SHORT, DIRECT, and CONCISE. Give ONLY the essential required info.
   - For greetings (e.g. "hi", "hello", "hey"): Respond in 1-2 sentences ONLY (e.g., "Hello! How can I assist you with your health today?"). NEVER list features, disclaimers, or write long introductions.
   - For medical queries: Maximum 2 to 4 short bullet points. Total response must be under 70 words.
   - For hospital queries: Name 2-3 verified hospitals from the directory with phone numbers, and mention the Locate Hospital Map (/locate).
   - No unnecessary filler, fluff, or conversational preambles.

2. NO EMOJIS (STRICT):
   - Do NOT use any emojis or emoji icons in your responses. Use standard text and clean markdown only.

3. EMERGENCIES:
   - If user reports severe emergency signs (chest pain, shortness of breath, stroke, acute bleeding): State "**EMERGENCY: Call 112 or 102 immediately.**" followed by 2 immediate first-aid steps.

DIRECTORY:
${citySummaries}`;
};

/**
 * Send chat message history to Groq API
 * @param {Array<{role: string, content: string}>} conversationHistory 
 * @param {Object} options 
 * @returns {Promise<{success: boolean, response: string, model: string}>}
 */
export async function sendGroqChatMessage(conversationHistory, options = {}) {
  const apiKey = getGroqApiKey();
  const userCity = options.city || 'pune';

  // Format messages for Groq OpenAI-compatible API
  const systemMessage = {
    role: 'system',
    content: buildSystemPrompt(userCity)
  };

  // Keep last 10 messages for context
  const recentMessages = conversationHistory.slice(-10).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));

  const messagesPayload = [systemMessage, ...recentMessages];

  let lastError = null;

  // Try each model until one succeeds
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: messagesPayload,
          temperature: 0.3,
          max_tokens: 250,
          top_p: 0.85
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Groq API error on model ${model} (${response.status}):`, errorText);
        lastError = new Error(`Groq API responded with status ${response.status}: ${errorText}`);
        continue; // Try next model
      }

      const data = await response.json();
      const aiReply = data.choices?.[0]?.message?.content;

      if (aiReply) {
        return {
          success: true,
          response: aiReply,
          model: model,
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn(`Fetch error with model ${model}:`, err);
      lastError = err;
    }
  }

  // If all models failed or network error occurred, fall back to intelligent offline assistant
  console.error('All Groq models failed. Generating intelligent fallback response.', lastError);
  const userLastMsg = conversationHistory[conversationHistory.length - 1]?.content || '';
  const fallbackResponse = generateIntelligentFallback(userLastMsg, userCity);

  return {
    success: true,
    response: fallbackResponse,
    model: 'healthbridge-local-fallback',
    timestamp: new Date().toISOString()
  };
}

/**
 * Intelligent fallback generator when network/API is unavailable
 */
export function generateIntelligentFallback(question, city = 'pune') {
  const q = (question || '').toLowerCase().trim();
  const cityKey = city.toLowerCase();
  const localFacilities = (INDIAN_HEALTHCARE_DATA[cityKey] || []).filter(f => f.type === 'hospital').slice(0, 3);

  // Greetings
  if (['hi', 'hello', 'hey', 'good morning', 'good evening', 'namaste'].some(g => q === g || q.startsWith(g + ' ') || q.startsWith(g + '!'))) {
    return `Hello! How can I assist you with your health or nearby facilities today?`;
  }

  // Check if asking for nearby hospitals or health resources
  if (q.includes('hospital') || q.includes('nearby') || q.includes('locate') || q.includes('doctor') || q.includes('clinic') || q.includes('emergency')) {
    const facilityList = localFacilities.map(f => `- **${f.name}** (${f.specialty}): ${f.address}, Phone: ${f.phone}`).join('\n');
    return `**Nearby Hospitals in ${city.toUpperCase()}:**\n\n${facilityList}\n\n*View full details on the [Locate Hospitals Page](/locate).*`;
  }

  // Emergency symptoms
  if (q.includes('chest pain') || q.includes('heart attack') || q.includes('stroke') || q.includes('breathing') || q.includes('bleeding')) {
    return `**EMERGENCY: Call 112 or 102 immediately.**\n\n- Sit upright and rest quietly while waiting for emergency assistance.\n- Loosen tight clothing and avoid exertion.\n- Have someone drive you to the nearest emergency department.`;
  }

  // Fever & Cold
  if (q.includes('fever') || q.includes('temperature') || q.includes('cold') || q.includes('cough')) {
    return `**Fever & Cold Care:**\n- Drink warm fluids and get adequate rest.\n- Paracetamol as directed can help reduce fever in adults.\n- Consult a doctor if fever lasts >3 days, exceeds 103°F (39.4°C), or causes difficulty breathing.`;
  }

  // General fallback
  return `Please ask your health question or specify your city to find nearby hospitals. For urgent medical emergencies, call 112 immediately.`;
}
