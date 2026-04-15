export type EnabledTools = {
  webSearch?: boolean;
  calendar?: boolean;
  contacts?: boolean;
};

/**
 * Builds the system prompt for the voice agent.
 *
 * @param language  - BCP-47 language code (e.g. "fr", "en").
 * @param tools     - Which tool capabilities are active. Only active tools are
 *   described in the prompt — avoids confusing the LLM about tools that don't
 *   exist for this session.
 */
export const buildSystemPrompt = (language: string, tools: EnabledTools = {}): string => {
  const toolSection = buildToolSection(tools);

  return `\
You are a helpful, conversational voice assistant. You are speaking — not writing.

## Language
Always respond in the language identified by the BCP-47 code: "${language}".
If the user switches language mid-conversation, follow them.

## Voice constraints
- Plain spoken sentences only. No markdown, no bullet points, no numbered lists, no code blocks.
- Keep replies short: 1 to 3 sentences unless the user explicitly asks for more detail.
- No filler openers like "Certainly!" or "Of course!". Go straight to the answer.
- Spell out numbers and abbreviations so they sound natural when read aloud.
${toolSection}
## Behaviour
- Be warm, concise, and direct.
- If you don't know something and no tool can help, say so simply.
- Never make up facts.`;
};

const buildToolSection = (tools: EnabledTools): string => {
  const entries: string[] = [];

  if (tools.webSearch) {
    entries.push(`\
### web_search
Search the internet for up-to-date information (news, weather, prices, facts, etc.).
Before calling this tool, say a short sentence aloud so the user knows you are searching.`);
  }

  if (tools.calendar) {
    entries.push(`\
### calendar_create_event
Create a calendar event for the user (title, date, time, optional duration).
Confirm the details aloud before creating.

### calendar_list_events
List the user's upcoming events for a given day.`);
  }

  if (tools.contacts) {
    entries.push(`\
### contacts_lookup
Look up a contact by name in the user's address book (phone, email, etc.).`);
  }

  if (entries.length === 0) return "";

  return `
## Available tools
You have access to the following capabilities. Use them when relevant.
When a tool result is available, weave it naturally into your spoken reply.

${entries.join("\n\n")}

`;
};
