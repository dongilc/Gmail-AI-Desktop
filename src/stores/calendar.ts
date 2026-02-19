import { create } from 'zustand';
import { CalendarEvent } from '../types';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

type CalendarViewType = 'day' | 'week' | 'month';

interface CalendarState {
  events: CalendarEvent[];
  selectedDate: Date;
  viewType: CalendarViewType;
  isLoading: boolean;
  error: string | null;

  // Actions
  setEvents: (events: CalendarEvent[]) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (event: CalendarEvent) => void;
  removeEvent: (eventId: string) => void;
  setSelectedDate: (date: Date) => void;
  setViewType: (type: CalendarViewType) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchEvents: (accountId: string, date?: Date) => Promise<void>;
  createEvent: (accountId: string, event: Partial<CalendarEvent>) => Promise<void>;
  saveEvent: (accountId: string, event: CalendarEvent) => Promise<void>;
  deleteEvent: (accountId: string, eventId: string) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  selectedDate: new Date(),
  viewType: 'day',
  isLoading: false,
  error: null,

  setEvents: (events) => set({ events }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),

  updateEvent: (updatedEvent) =>
    set((state) => ({
      events: state.events.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)),
    })),

  removeEvent: (eventId) =>
    set((state) => ({
      events: state.events.filter((event) => event.id !== eventId),
    })),

  setSelectedDate: (date) => set({ selectedDate: date }),

  setViewType: (viewType) => set({ viewType }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  fetchEvents: async (accountId, date) => {
    const { viewType, selectedDate } = get();
    const targetDate = date || selectedDate;

    set({ isLoading: true, error: null, events: [] });

    let timeMin: Date;
    let timeMax: Date;

    switch (viewType) {
      case 'day':
        timeMin = startOfDay(targetDate);
        timeMax = endOfDay(targetDate);
        break;
      case 'week':
        timeMin = startOfWeek(targetDate, { weekStartsOn: 0 });
        timeMax = endOfWeek(targetDate, { weekStartsOn: 0 });
        break;
      case 'month':
        timeMin = startOfMonth(targetDate);
        timeMax = endOfMonth(targetDate);
        break;
    }

    try {
      const events = await window.electronAPI.getEvents(accountId, timeMin, timeMax);
      const eventsWithAccount = events.map((event: CalendarEvent) => ({
        ...event,
        accountId,
        start: new Date(event.start),
        end: new Date(event.end),
      }));

      set({ events: eventsWithAccount, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : '\uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uB3C4\uC911 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
        isLoading: false,
      });
    }
  },

  createEvent: async (accountId, eventData) => {
    set({ isLoading: true, error: null });

    try {
      const event = await window.electronAPI.createEvent(accountId, eventData);
      const eventWithAccount = {
        ...event,
        accountId,
        start: new Date(event.start),
        end: new Date(event.end),
      };

      get().addEvent(eventWithAccount);
      set({ isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : '\uC77C\uC815 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
        isLoading: false,
      });
      throw error;
    }
  },

  saveEvent: async (accountId, event) => {
    set({ isLoading: true, error: null });

    try {
      const updatedEvent = await window.electronAPI.updateEvent(accountId, event);
      const eventWithAccount = {
        ...updatedEvent,
        accountId,
        start: new Date(updatedEvent.start),
        end: new Date(updatedEvent.end),
      };

      get().updateEvent(eventWithAccount);
      set({ isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : '\uC77C\uC815 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteEvent: async (accountId, eventId) => {
    set({ isLoading: true, error: null });

    try {
      await window.electronAPI.deleteEvent(accountId, eventId);
      get().removeEvent(eventId);
      set({ isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : '\uC77C\uC815 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
        isLoading: false,
      });
      throw error;
    }
  },
}));
