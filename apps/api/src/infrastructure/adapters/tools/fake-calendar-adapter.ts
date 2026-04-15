import type { CalendarPort, CalendarEvent } from "@/domain/ports/calendar-port";

const FAKE_EVENTS: Omit<CalendarEvent, "date">[] = [
  { title: "Réunion d'équipe", time: "09:00", duration_minutes: 60 },
  { title: "Déjeuner avec Marie", time: "12:30", duration_minutes: 90 },
  { title: "Appel client Dupont & Associés", time: "14:00", duration_minutes: 45 },
  { title: "Revue de sprint", time: "15:30", duration_minutes: 30 },
  { title: "Rendez-vous médecin", time: "17:00", duration_minutes: 30 },
  { title: "Cours de tennis", time: "18:30", duration_minutes: 60 },
  { title: "Dîner famille", time: "20:00", duration_minutes: 120 },
];

const pickN = <T>(arr: T[], n: number): T[] => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

// TODO: replace with a real calendar API (Google Calendar, Outlook, etc.)
export class FakeCalendarAdapter implements CalendarPort {
  async createEvent(event: CalendarEvent): Promise<{ success: boolean; message: string }> {
    const { title, date, time, duration_minutes } = event;
    return {
      success: true,
      message: `Événement "${title}" ajouté pour le ${date}${time ? ` à ${time}` : ""}${duration_minutes ? ` (${duration_minutes} min)` : ""}.`,
    };
  }

  async listEvents(date: string): Promise<{ events: CalendarEvent[]; message: string }> {
    const count = Math.floor(Math.random() * 3) + 1;
    const events = pickN(FAKE_EVENTS, count).map((e) => ({ ...e, date }));
    const summary = events.map((e) => `${e.time} ${e.title}`).join(", ");
    return {
      events,
      message: `${events.length} événement(s) le ${date} : ${summary}.`,
    };
  }
}
