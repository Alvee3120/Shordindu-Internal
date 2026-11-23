export interface ChatMessageDto {
  id: string;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
    avatarFile: string | null;
  };
  content: string;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  replyTo: {
    id: string;
    content: string;
    deleted: boolean;
    author: { id: string; name: string };
  } | null;
}
