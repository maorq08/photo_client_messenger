import Anthropic from '@anthropic-ai/sdk';
import type { User, Client, Message } from './types';

let anthropic: Anthropic | null = null;

export function initAI(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic();
  }
}

export function isAIAvailable(): boolean {
  return !!anthropic;
}

export async function generateResponse(
  user: User,
  client: Client,
  clientMessages: Message[]
): Promise<string> {
  if (!anthropic) throw new Error('AI not available');

  const conversationHistory = clientMessages
    .map(m => `${m.sender === 'client' ? client.name : user.name}: ${m.text}`)
    .join('\n\n');

  const tone = user.tone || 'friendly and casual';
  const systemPrompt = `You are helping ${user.name}, a ${user.specialty}, write responses to clients.

About ${user.name}: ${user.notes}

${client.notes ? `About this client (${client.name}): ${client.notes}` : ''}

IMPORTANT: Write in a ${tone} tone. Match this style throughout the response.

The response should sound like it's coming from a real person who loves their work. Don't use corporate jargon.

Just write the response text - no greeting prefix needed unless contextually appropriate.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Here's my conversation history with ${client.name}:\n\n${conversationHistory}\n\nPlease write a friendly response to continue this conversation.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || '';
}

export async function improveMessage(
  user: User,
  client: Client,
  clientMessages: Message[],
  draft: string
): Promise<string> {
  if (!anthropic) throw new Error('AI not available');

  const conversationHistory = clientMessages
    .map(m => `${m.sender === 'client' ? client.name : user.name}: ${m.text}`)
    .join('\n\n');

  const tone = user.tone || 'friendly and casual';
  const systemPrompt = `You are helping ${user.name}, a ${user.specialty}, improve their message.

About ${user.name}: ${user.notes}

${client.notes ? `About this client (${client.name}): ${client.notes}` : ''}

IMPORTANT: The message should have a ${tone} tone.

Take the draft message and make it:
1. Match the ${tone} tone
2. Sound natural and conversational
3. Fix any awkward phrasing
4. Keep the same meaning and intent

Just return the improved message text, nothing else.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Conversation history with ${client.name}:\n\n${conversationHistory}\n\nMy draft response:\n"${draft}"\n\nPlease improve this to sound more natural and friendly.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || '';
}
