import { requireUser } from "@/lib/auth";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const user = await requireUser();

  return (
    <ChatView
      viewer={{
        id: user.id,
        name: user.name,
        position: user.position,
        department: user.department,
      }}
    />
  );
}
