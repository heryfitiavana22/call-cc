export interface CalendarEvent {
  title: string;
  date: string;
  time?: string;
  duration_minutes?: number;
}

export interface CalendarPort {
  createEvent(event: CalendarEvent): Promise<{ success: boolean; message: string }>;
  listEvents(date: string): Promise<{ events: CalendarEvent[]; message: string }>;
}
