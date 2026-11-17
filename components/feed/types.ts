export interface FeedItemDto {
  id: string;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  updateDate: string;
  postedAt: string;
  isLate: boolean;
  editedAt: string | null;
  contentHtml: string;
  headline: string | null;
}

export interface PersonDto {
  id: string;
  name: string;
  department: string;
  position: string;
}
