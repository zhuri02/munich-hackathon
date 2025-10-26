import { cn } from "@/lib/utils";

interface AudioBubblesProps {
  isActive: boolean;
}

const AudioBubbles = ({ isActive }: AudioBubblesProps) => {
  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
      {/* Pulsing popup overlay - centered */}
      <div className="absolute w-full h-full animate-pulse flex items-center justify-center">
        <div className="w-12 h-12 rounded-lg bg-primary/30 shadow-[0_0_40px_rgba(255,119,0,0.6)]" />
      </div>
      
      {/* Expanding rings - centered */}
      <div className="absolute w-full h-full flex items-center justify-center">
        <div 
          className="absolute w-12 h-12 rounded-lg border-2 border-primary/70 animate-ping" 
          style={{ animationDuration: '1.2s' }} 
        />
        <div 
          className="absolute w-16 h-16 rounded-lg border-2 border-primary/50 animate-ping" 
          style={{ animationDuration: '1.6s' }} 
        />
        <div 
          className="absolute w-20 h-20 rounded-lg border-2 border-primary/30 animate-ping" 
          style={{ animationDuration: '2s' }} 
        />
      </div>

      {/* Center glow pulse */}
      <div className="absolute w-full h-full flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-primary/50 blur-sm animate-pulse" 
             style={{ animationDuration: '0.8s' }} />
      </div>
    </div>
  );
};

export default AudioBubbles;
