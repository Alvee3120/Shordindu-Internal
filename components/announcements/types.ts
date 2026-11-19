export interface AnnouncementDto {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: string;
  editedAt: string | null;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  canEdit: boolean;
}
