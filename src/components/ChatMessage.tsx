import { cn } from "@/lib/utils";
import { Bot, User, Loader2 } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isLoading?: boolean;
}

const ChatMessage = ({ role, content, timestamp, isLoading = false }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div className={cn(
      "flex gap-4 p-6 animate-in fade-in-50 slide-in-from-bottom-3 duration-500",
      isUser ? "bg-transparent" : "bg-card/50"
    )}>
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
        isUser 
          ? "bg-gradient-to-br from-primary to-accent shadow-glow" 
          : "bg-secondary border border-border"
      )}>
        {isUser ? (
          <User className="h-5 w-5 text-primary-foreground" />
        ) : (
          <Bot className={cn(
            "h-5 w-5 text-foreground",
            isLoading && "animate-pulse"
          )} />
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? "You" : "AI Assistant"}
          </span>
          {timestamp && (
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          )}
        </div>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">Thinking...</span>
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
