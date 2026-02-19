import { google, Auth, calendar_v3 } from 'googleapis';
import { CalendarEvent, Attendee, Reminder } from '../../src/types';

export class CalendarService {
  private getClient(auth: Auth.OAuth2Client): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth });
  }

  async getEvents(
    auth: Auth.OAuth2Client,
    timeMin: Date,
    timeMax: Date,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent[]> {
    const calendar = this.getClient(auth);

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events: CalendarEvent[] = [];

    if (response.data.items) {
      for (const event of response.data.items) {
        if (!event.id) continue;

        const start = event.start?.dateTime
          ? new Date(event.start.dateTime)
          : event.start?.date
          ? new Date(event.start.date)
          : new Date();

        const end = event.end?.dateTime
          ? new Date(event.end.dateTime)
          : event.end?.date
          ? new Date(event.end.date)
          : new Date();

        const allDay = !event.start?.dateTime;

        const attendees: Attendee[] =
          event.attendees?.map((a) => ({
            email: a.email!,
            name: a.displayName || undefined,
            responseStatus: (a.responseStatus as Attendee['responseStatus']) || 'needsAction',
          })) || [];

        const reminders: Reminder[] =
          event.reminders?.overrides?.map((r) => ({
            method: r.method as Reminder['method'],
            minutes: r.minutes!,
          })) || [];

        events.push({
          id: event.id,
          accountId: '', // 호출자가 설정
          calendarId,
          title: event.summary || '(제목 없음)',
          description: event.description || undefined,
          location: event.location || undefined,
          start,
          end,
          allDay,
          color: event.colorId || undefined,
          attendees: attendees.length > 0 ? attendees : undefined,
          reminders: reminders.length > 0 ? reminders : undefined,
        });
      }
    }

    return events;
  }

  async createEvent(
    auth: Auth.OAuth2Client,
    event: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    const calendar = this.getClient(auth);

    const eventBody: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: this.formatDate(event.start!) }
        : { dateTime: event.start!.toISOString() },
      end: event.allDay
        ? { date: this.formatDatePlusOne(event.end!) } // Google Calendar API: allDay end date is exclusive
        : { dateTime: event.end!.toISOString() },
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.name,
      })),
      reminders: event.reminders
        ? {
            useDefault: false,
            overrides: event.reminders.map((r) => ({
              method: r.method,
              minutes: r.minutes,
            })),
          }
        : undefined,
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    });

    return {
      id: response.data.id!,
      accountId: event.accountId || '',
      calendarId,
      title: response.data.summary || '',
      description: response.data.description || undefined,
      location: response.data.location || undefined,
      start: new Date(response.data.start?.dateTime || response.data.start?.date || ''),
      end: new Date(response.data.end?.dateTime || response.data.end?.date || ''),
      allDay: !response.data.start?.dateTime,
      color: response.data.colorId || undefined,
    };
  }

  async updateEvent(
    auth: Auth.OAuth2Client,
    event: CalendarEvent,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    const calendar = this.getClient(auth);

    const eventBody: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: this.formatDate(event.start) }
        : { dateTime: event.start.toISOString() },
      end: event.allDay
        ? { date: this.formatDatePlusOne(event.end) } // Google Calendar API: allDay end date is exclusive
        : { dateTime: event.end.toISOString() },
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.name,
      })),
      reminders: event.reminders
        ? {
            useDefault: false,
            overrides: event.reminders.map((r) => ({
              method: r.method,
              minutes: r.minutes,
            })),
          }
        : undefined,
    };

    const response = await calendar.events.update({
      calendarId,
      eventId: event.id,
      requestBody: eventBody,
    });

    return {
      id: response.data.id!,
      accountId: event.accountId,
      calendarId,
      title: response.data.summary || '',
      description: response.data.description || undefined,
      location: response.data.location || undefined,
      start: new Date(response.data.start?.dateTime || response.data.start?.date || ''),
      end: new Date(response.data.end?.dateTime || response.data.end?.date || ''),
      allDay: !response.data.start?.dateTime,
      color: response.data.colorId || undefined,
    };
  }

  async deleteEvent(
    auth: Auth.OAuth2Client,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<void> {
    const calendar = this.getClient(auth);

    await calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  private formatDate(date: Date): string {
    // 로컬 시간대 기준으로 날짜 포맷 (UTC 변환 문제 방지)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDatePlusOne(date: Date): string {
    // Google Calendar API의 allDay end date는 exclusive이므로 하루 추가
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return this.formatDate(nextDay);
  }
}
