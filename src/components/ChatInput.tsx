import { useState, useRef } from "react";
import { Send, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import AudioBubbles from "./AudioBubbles";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onFileUpload: (files: FileList) => void;
  onAudioUpload: (audioBlob: Blob) => void;
  isVoiceMode: boolean;
  onToggleVoice: () => void;
}

const ChatInput = ({ onSendMessage, onFileUpload, onAudioUpload, isVoiceMode, onToggleVoice }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        onAudioUpload(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast({
        title: "Recording started",
        description: "Speak now...",
      });
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        title: "Microphone error",
        description: "Unable to access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast({
        title: "Recording stopped",
        description: "Processing audio...",
      });
    }
  };

  const handleVoiceToggle = () => {
    if (isVoiceMode && isRecording) {
      stopRecording();
    }
    onToggleVoice();
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything or upload documents..."
              className="min-h-[60px] max-h-[200px] resize-none bg-secondary border-border focus:border-primary transition-colors pr-12"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative w-12 h-12">
              <AudioBubbles isActive={isRecording} />
              <Button
                variant={isRecording ? "default" : "outline"}
                size="icon"
                onClick={handleMicClick}
                className={cn(
                  "flex-shrink-0 transition-all relative z-10 w-12 h-12",
                  isRecording && "bg-transparent hover:bg-transparent border-transparent opacity-0"
                )}
              >
                {isRecording ? (
                  <MicOff className="h-5 w-5 opacity-0" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            </div>

            <Button
              onClick={handleSend}
              disabled={!message.trim()}
              className="flex-shrink-0 bg-gradient-to-br from-primary to-accent hover:opacity-90 shadow-glow disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
