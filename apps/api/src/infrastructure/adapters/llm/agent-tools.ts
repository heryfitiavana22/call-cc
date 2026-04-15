import { tool, jsonSchema } from "ai";
import type { ToolSet } from "ai";
import type { IWebSearch } from "@/domain/ports/i-web-search";
import type { ICalendar } from "@/domain/ports/i-calendar";
import type { IContacts } from "@/domain/ports/i-contacts";

export interface ToolAdapters {
  webSearch?: IWebSearch;
  calendar?: ICalendar;
  contacts?: IContacts;
}

/**
 * Builds the AI SDK ToolSet from the provided adapters.
 * Only tools whose adapter is present are included — if an adapter is absent
 * the tool is simply omitted (and should also be absent from the system prompt).
 */
export const buildAgentTools = (adapters: ToolAdapters): ToolSet => {
  const tools: Record<string, unknown> = {};

  if (adapters.webSearch) {
    const webSearch = adapters.webSearch;
    tools.web_search = tool({
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
    tools.calendar_create_event = tool({
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

    tools.calendar_list_events = tool({
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
    tools.contacts_lookup = tool({
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
