import { linkifyTextToNodes } from "@/lib/linkify-text";

interface MessageTextProps {
  text: string;
}

export function MessageText({ text }: MessageTextProps) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-[var(--wa-text)]">
      {linkifyTextToNodes(text, "msg-link")}
    </p>
  );
}
