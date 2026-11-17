export interface AuthorDto {
  name: string;
  position: string;
  department: string;
}

export interface UpdateDto {
  id: string;
  updateDate: string;
  postedAt: string;
  isLate: boolean;
  editedAt: string | null;
  contentHtml: string;
  canEdit: boolean;
}
