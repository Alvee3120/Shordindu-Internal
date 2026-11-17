import { cn } from "@/lib/utils";

export function RichTextContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn("rich-text text-sm leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
