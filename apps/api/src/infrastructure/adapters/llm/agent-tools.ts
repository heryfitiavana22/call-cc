import { tool, jsonSchema } from "ai";
import type { ToolSet } from "ai";
import type { WebSearchPort } from "@/domain/ports/web-search-port";
import type { CalendarPort } from "@/domain/ports/calendar-port";
import type { ContactsPort } from "@/domain/ports/contacts-port";
import { TOOL_KEYS } from "@/config/tool-keys";

export interface ToolAdapters {
  webSearch?: WebSearchPort;
  calendar?: CalendarPort;
  contacts?: ContactsPort;
}

/**
 * Builds the AI SDK ToolSet from the provided adapters.
 * Only tools whose adapter is present are included — if an adapter is absent
 * the tool is simply omitted (and should also be absent from the system prompt).
 * Tool key names come from TOOL_KEYS — change them there to keep prompt + SDK in sync.
 */
export const buildAgentTools = (adapters: ToolAdapters): ToolSet => {
  const tools: Record<string, unknown> = {};

  if (adapters.webSearch) {
    const webSearch = adapters.webSearch;
    tools[TOOL_KEYS.webSearch] = tool({
      description:
        "Search the internet for up-to-date information: news, weather, prices, facts, etc.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "The search query in the user's language" },
        },
        required: ["query"],
      }),
      execute: async (args: { query: string }) => {
        const results = await webSearch.search(args.query);
        return { results };
      },
    });
  }

  if (adapters.calendar) {
    const calendar = adapters.calendar;
    tools[TOOL_KEYS.calendarCreate] = tool({
      description: "Create a calendar event for the user.",
      inputSchema: jsonSchema<{
        title: string;
        date: string;
        time?: string;
        duration_minutes?: number;
      }>({
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the event" },
          date: { type: "string", description: "Date in ISO 8601 format (YYYY-MM-DD)" },
          time: { type: "string", description: "Start time in HH:MM (24h)" },
          duration_minutes: { type: "number", description: "Duration in minutes" },
        },
        required: ["title", "date"],
      }),
      execute: async (args: {
        title: string;
        date: string;
        time?: string;
        duration_minutes?: number;
      }) => calendar.createEvent(args),
    });

    tools[TOOL_KEYS.calendarList] = tool({
      description: "List the user's calendar events for a given date.",
      inputSchema: jsonSchema<{ date: string }>({
        type: "object",
        properties: {
          date: { type: "string", description: "Date in ISO 8601 format (YYYY-MM-DD)" },
        },
        required: ["date"],
      }),
      execute: async (args: { date: string }) => calendar.listEvents(args.date),
    });
  }

  if (adapters.contacts) {
    const contacts = adapters.contacts;
    tools[TOOL_KEYS.contactsLookup] = tool({
      description: "Look up a contact by name in the user's address book.",
      inputSchema: jsonSchema<{ name: string }>({
        type: "object",
        properties: {
          name: { type: "string", description: "Full or partial name of the contact" },
        },
        required: ["name"],
      }),
      execute: async (args: { name: string }) => contacts.lookup(args.name),
    });
  }

  return tools as ToolSet;
};
