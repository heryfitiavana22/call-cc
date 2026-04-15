import type { ICalendar, CalendarEvent } from "@/domain/ports/i-calendar";

// TODO: replace with a real calendar API (Google Calendar, Outlook, etc.)
export class FakeCalendarAdapter implements ICalendar {
  async createEvent(event: CalendarEvent): Promise<{ success: boolean; message: string }> {
    const { title, date, time, duration_minutes } = event;
    return {
      success: true,
      message: `Événement "${title}" créé pour le ${date}${time ? ` à ${time}` : ""}${duration_minutes ? ` (${duration_minutes} min)` : ""}. (simulation)`,
    };
  }

  async listEvents(date: string): Promise<{ events: CalendarEvent[]; message: string }> {
    return {
      events: [],
      message: `Aucun événement trouvé pour le ${date}. (simulation)`,
    };
  }
}
