export type ReactionKindDto = "like" | "dislike";

export interface ReactionUserDto {
  id: string;
  name: string;
}

export interface ReactionSummaryDto {
  kind: ReactionKindDto;
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
    avatarFile: string | null;
  };
  content: string;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  reactions: ReactionSummaryDto[];
}
