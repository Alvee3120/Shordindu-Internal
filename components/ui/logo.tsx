import { cn } from "@/lib/utils";

/**
 * The dark brand mark: orange moon and white wordmark on transparency, so it
 * needs a pine surface behind it. The asset is already trimmed, so it renders
 * at the requested height with its own aspect ratio.
 */
const ASPECT = 986 / 459;

export function Logo({
  height = 40,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Shordindu"
      className={cn(
        "block shrink-0 bg-contain bg-center bg-no-repeat",
        className
      )}
      style={{
        backgroundImage: "url(/logoDark.png)",
        height,
        width: Math.round(height * ASPECT),
      }}
    />
  );
}
