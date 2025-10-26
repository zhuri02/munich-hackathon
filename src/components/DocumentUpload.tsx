import { FileText, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  content?: string;
  isProcessed?: boolean;
  isBinary?: boolean;
}

interface DocumentUploadProps {
  files: UploadedFile[];
  onRemoveFile: (id: string) => void;
  onUploadFiles: (files: File[]) => void;
  onProcessBinaryFiles: () => void;
}

const DocumentUpload = ({ files, onRemoveFile, onUploadFiles, onProcessBinaryFiles }: DocumentUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const binaryFilesCount = files.filter(f => f.isBinary && !f.isProcessed).length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onUploadFiles(selectedFiles);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*"
              onChange={handleFileChange}
              className="hidden"
            />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="shadow-lg hover:shadow-xl transition-shadow bg-background/95 backdrop-blur-sm"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
        {binaryFilesCount > 0 && (
          <Button
            variant="default"
            size="sm"
            onClick={onProcessBinaryFiles}
            className="shadow-lg hover:shadow-xl transition-shadow"
          >
            Process {binaryFilesCount} Binary File{binaryFilesCount > 1 ? 's' : ''}
          </Button>
        )}
      </div>
      {files.length > 0 && (
        <div className="absolute top-16 right-4 max-w-md z-10">
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-background/95 backdrop-blur-sm border border-border/50 shadow-lg">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg",
                  "bg-background border border-border/50",
                  "hover:border-primary transition-all hover:shadow-md group",
                  file.isBinary && !file.isProcessed && "border-yellow-500"
                )}
              >
            <FileText className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{file.name}</p>
                {file.isBinary && !file.isProcessed && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                    Not in RAG
                  </span>
                )}
                {file.isProcessed && (
                  <span className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                    In RAG
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{file.size}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onRemoveFile(file.id)}
            >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
