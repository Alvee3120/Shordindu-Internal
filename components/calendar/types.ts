export type CalendarItemKind = "event" | "assignment";

export interface CalendarItemDto {
  id: string;
  kind: CalendarItemKind;
  title: string;
  notes: string | null;
  date: string;
  done: boolean;
  canEdit: boolean;
  link: string | null;
}

export interface CalendarEventDto {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  done: boolean;
  createdAt: string;
  editedAt: string | null;
}
