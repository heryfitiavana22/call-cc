import { useEffect, useRef } from "react";
import { useVoiceCall } from "@/hooks/use-voice-call";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { CallState } from "@call-cc/types";
import type { Message } from "@/hooks/use-voice-call";
import { cn } from "@/lib/utils";

// — Status label ——————————————————————————————————————————————————————

const STATUS_LABEL: Record<CallState, string> = {
  idle: "",
  listening: "À l'écoute",
  processing: "...",
  speaking: "En train de parler",
};

// — Message bubble ————————————————————————————————————————————————————

const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[72%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {message.text}
      </p>
    </div>
  );
};

// — Main component ————————————————————————————————————————————————————

export const VoiceCall = () => {
  const { state, messages, error, startCall, endCall } = useVoiceCall();
  const isActive = state !== "idle";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <header className="border-b px-5 py-4">
        <span className="text-sm font-medium">Léa</span>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-2 py-5">
          {messages.length === 0 && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              {isActive ? "Parlez pour commencer" : "Démarrez un appel pour parler avec Léa"}
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Error */}
      {error && <p className="px-5 pb-2 text-sm text-destructive">{error}</p>}

      {/* Footer */}
      <footer className="border-t px-4 pb-4 pt-3">
        {isActive && STATUS_LABEL[state] && (
          <p className="mb-3 text-center text-sm text-foreground">{STATUS_LABEL[state]}</p>
        )}
        {!isActive ? (
          <Button onClick={() => void startCall()} className="w-full" size="lg">
            Démarrer l&apos;appel
          </Button>
        ) : (
          <Button onClick={endCall} variant="destructive" className="w-full" size="lg">
            Terminer l&apos;appel
          </Button>
        )}
      </footer>
    </div>
  );
};
