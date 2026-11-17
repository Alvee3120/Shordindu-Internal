export interface ReactionUserDto {
  id: string;
  name: string;
}

export interface ReactionSummaryDto {
  emoji: string;
  count: number;
  users: ReactionUserDto[];
  reactedByMe: boolean;
}

export interface CommentDto {
  id: string;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  contentHtml: string;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  reactions: ReactionSummaryDto[];
}
