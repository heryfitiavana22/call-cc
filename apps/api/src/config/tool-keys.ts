/**
 * Canonical tool key names used in both the AI SDK ToolSet and the system prompt.
 * Changing a key here automatically updates both — no manual prompt edits needed.
 */
export const TOOL_KEYS = {
  webSearch: "web_search",
  calendarCreate: "calendar_create_event",
  calendarList: "calendar_list_events",
  contactsLookup: "contacts_lookup",
} as const;
