import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ToastAction } from "@/components/ui/toast";
import ChatSidebar from "@/components/ChatSidebar";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import DocumentUpload from "@/components/DocumentUpload";
import StarBackground from "@/components/StarBackground";
import RenameDialog from "@/components/RenameDialog";
import ProjectDialog from "@/components/ProjectDialog";
import { useToast } from "@/hooks/use-toast";
import { sendTextToN8N } from "@/services/n8n";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  isProcessed?: boolean;
  isBinary?: boolean;
  fileId?: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: string;
  project_id?: string | null;
  user_id?: string;
}

interface Project {
  id: string;
  name: string;
  user_id?: string;
}

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingItem, setRenamingItem] = useState<{ type: "chat" | "project"; id: string; name: string } | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [movingChat, setMovingChat] = useState<Chat | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ type: "chat" | "project"; id: string; timeout: NodeJS.Timeout } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else if (event === "SIGNED_IN") {
        setTimeout(() => {
          loadChatsAndProjects();
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Load data when user is authenticated
  useEffect(() => {
    if (user) {
      loadChatsAndProjects();
    }
  }, [user]);

  const loadChatsAndProjects = async () => {
    if (!user) return;

    try {
      // Load projects
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Load chats
      const { data: chatsData, error: chatsError } = await supabase
        .from("chats")
        .select("*")
        .order("created_at", { ascending: false });

      if (chatsError) throw chatsError;

      // Load messages for each chat
      const chatsWithMessages = await Promise.all(
        (chatsData || []).map(async (chat) => {
          const { data: messagesData } = await supabase
            .from("messages")
            .select("*")
            .eq("chat_id", chat.id)
            .order("created_at", { ascending: true });

          return {
            ...chat,
            messages: (messagesData || []).map((msg) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: new Date(msg.created_at).toLocaleTimeString(),
            })),
            timestamp: chat.created_at,
          };
        }),
      );

      setChats(chatsWithMessages);

      // Set current chat to the most recent one
      if (chatsWithMessages.length > 0 && !currentChatId) {
        setCurrentChatId(chatsWithMessages[0].id);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load your data",
        variant: "destructive",
      });
    }
  };

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages || [];

  const handleCreateNewChat = async () => {
    if (!user) return;

    try {
      const { data: newChat, error } = await supabase
        .from("chats")
        .insert({
          user_id: user.id,
          title: "New Conversation",
        })
        .select()
        .single();

      if (error) throw error;

      const chatWithMessages: Chat = {
        ...newChat,
        messages: [],
        timestamp: newChat.created_at,
      };

      setChats((prev) => [chatWithMessages, ...prev]);
      setCurrentChatId(newChat.id);
      setUploadedFiles([]);

      toast({
        title: "New chat created",
        description: "Started a fresh conversation",
      });
    } catch (error) {
      console.error("Error creating chat:", error);
      toast({
        title: "Error",
        description: "Failed to create chat",
        variant: "destructive",
      });
    }
  };

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setUploadedFiles([]);
  };

  const handleDeleteChat = async (chatId: string) => {
    const chatToDelete = chats.find((c) => c.id === chatId);
    if (!chatToDelete) return;

    // Clear any existing pending deletion
    if (pendingDeletion) {
      clearTimeout(pendingDeletion.timeout);
      setPendingDeletion(null);
    }

    try {
      // Delete from database immediately
      const { error } = await supabase.from("chats").delete().eq("id", chatId);
      if (error) throw error;

      // Remove from UI
      setChats((prev) => prev.filter((c) => c.id !== chatId));

      // Handle current chat navigation
      if (currentChatId === chatId) {
        const remainingChats = chats.filter((c) => c.id !== chatId);
        if (remainingChats.length > 0) {
          setCurrentChatId(remainingChats[0].id);
        } else {
          handleCreateNewChat();
        }
      }

      // Show undo toast that re-inserts on undo
      toast({
        title: "Chat deleted",
        description: "Undo to restore",
        action: (
          <ToastAction
            altText="Undo deletion"
            onClick={async () => {
              try {
                // Re-insert the chat
                const { data: restoredChat, error: restoreError } = await supabase
                  .from("chats")
                  .insert({
                    id: chatToDelete.id,
                    title: chatToDelete.title,
                    user_id: chatToDelete.user_id,
                    project_id: chatToDelete.project_id,
                    created_at: chatToDelete.timestamp,
                  })
                  .select()
                  .single();

                if (restoreError) throw restoreError;

                // Re-insert all messages
                if (chatToDelete.messages.length > 0) {
                  const messagesToInsert = chatToDelete.messages.map((msg) => ({
                    chat_id: chatToDelete.id,
                    role: msg.role,
                    content: msg.content,
                  }));

                  await supabase.from("messages").insert(messagesToInsert);
                }

                // Restore in UI
                setChats((prev) =>
                  [...prev, chatToDelete].sort(
                    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  )
                );

                toast({
                  title: "Restored",
                  description: "Chat has been restored",
                });
              } catch (error) {
                console.error("Error restoring chat:", error);
                toast({
                  title: "Error",
                  description: "Failed to restore chat",
                  variant: "destructive",
                });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error("Error deleting chat:", error);
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      });
    }
  };

  const handleRenameChat = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setRenamingItem({ type: "chat", id: chatId, name: chat.title });
      setRenameDialogOpen(true);
    }
  };

  const handleMoveToProject = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setMovingChat(chat);
      setProjectDialogOpen(true);
    }
  };

  const handleAssignToProject = async (chatId: string, projectId: string | null) => {
    try {
      const { error } = await supabase.from("chats").update({ project_id: projectId }).eq("id", chatId);

      if (error) throw error;

      setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, project_id: projectId } : chat)));

      toast({
        title: "Chat moved",
        description: projectId ? "Chat assigned to project" : "Chat removed from project",
      });
    } catch (error) {
      console.error("Error moving chat:", error);
      toast({
        title: "Error",
        description: "Failed to move chat",
        variant: "destructive",
      });
    }
  };

  const handleCreateProject = async () => {
    if (!user) return;

    try {
      const { data: newProject, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: "New Project",
        })
        .select()
        .single();

      if (error) throw error;

      setProjects((prev) => [...prev, newProject]);
      toast({
        title: "Project created",
        description: "New project added",
      });
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const projectToDelete = projects.find((p) => p.id === projectId);
    if (!projectToDelete) return;

    // Clear any existing pending deletion
    if (pendingDeletion) {
      clearTimeout(pendingDeletion.timeout);
      setPendingDeletion(null);
    }

    try {
      // Delete from database immediately
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;

      // Remove from UI
      setProjects((prev) => prev.filter((p) => p.id !== projectId));

      // Show undo toast that re-inserts on undo
      toast({
        title: "Project deleted",
        description: "Undo to restore",
        action: (
          <ToastAction
            altText="Undo deletion"
            onClick={async () => {
              try {
                // Re-insert the project
                const { error: restoreError } = await supabase.from("projects").insert({
                  id: projectToDelete.id,
                  name: projectToDelete.name,
                  user_id: projectToDelete.user_id,
                });

                if (restoreError) throw restoreError;

                // Restore in UI
                setProjects((prev) => [...prev, projectToDelete]);

                toast({
                  title: "Restored",
                  description: "Project has been restored",
                });
              } catch (error) {
                console.error("Error restoring project:", error);
                toast({
                  title: "Error",
                  description: "Failed to restore project",
                  variant: "destructive",
                });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  const handleRenameProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setRenamingItem({ type: "project", id: projectId, name: project.name });
      setRenameDialogOpen(true);
    }
  };

  const handleRename = async (newName: string) => {
    if (!renamingItem) return;

    try {
      if (renamingItem.type === "chat") {
        const { error } = await supabase.from("chats").update({ title: newName }).eq("id", renamingItem.id);

        if (error) throw error;

        setChats((prev) => prev.map((chat) => (chat.id === renamingItem.id ? { ...chat, title: newName } : chat)));
      } else {
        const { error } = await supabase.from("projects").update({ name: newName }).eq("id", renamingItem.id);

        if (error) throw error;

        setProjects((prev) =>
          prev.map((project) => (project.id === renamingItem.id ? { ...project, name: newName } : project)),
        );
      }

      toast({
        title: "Renamed",
        description: `${renamingItem.type === "chat" ? "Chat" : "Project"} renamed successfully`,
      });
    } catch (error) {
      console.error("Error renaming:", error);
      toast({
        title: "Error",
        description: "Failed to rename",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleSendMessage = async (content: string) => {
    if (!currentChatId || !user) return;

    const tempMessageId = Date.now().toString();
    const userMessage: Message = {
      id: tempMessageId,
      role: "user",
      content,
      timestamp: "just now",
    };

    // Optimistically update UI
    setChats((prev) =>
      prev.map((chat) => (chat.id === currentChatId ? { ...chat, messages: [...chat.messages, userMessage] } : chat)),
    );

    // Save to database
    try {
      const { error: msgError } = await supabase.from("messages").insert({
        chat_id: currentChatId,
        role: "user",
        content,
      });

      if (msgError) throw msgError;

      // Update chat title if it's the first user message
      if (currentChat && currentChat.messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");

        const { error: chatError } = await supabase.from("chats").update({ title }).eq("id", currentChatId);

        if (!chatError) {
          setChats((prev) => prev.map((chat) => (chat.id === currentChatId ? { ...chat, title } : chat)));
        }
      }
    } catch (error) {
      console.error("Error saving message:", error);
    }

    try {
      // Show loading state
      setIsAiLoading(true);

      // Prepare conversation history for context
      const conversationHistory = currentChat?.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })) || [];

      // Send to N8N with full conversation history
      const n8nResponse = await sendTextToN8N(content, {
        messageId: userMessage.id,
        chatId: currentChatId,
        source: "chat",
        isVoiceMode,
      }, conversationHistory);

      // DEBUG: Log the actual response to see what we get
      console.log("N8N Full Response:", n8nResponse);
      console.log("N8N Response Data:", n8nResponse.data);

      if (!n8nResponse.success) {
        toast({
          title: "Error",
          description: n8nResponse.message,
          variant: "destructive",
        });

        // Show error message in chat
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your request. Please try again.",
          timestamp: "just now",
        };
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === currentChatId ? { ...chat, messages: [...chat.messages, errorMessage] } : chat,
          ),
        );
        return;
      }

      // Extract the AI response from N8N webhook response
      let aiResponseContent = "I received your message but couldn't generate a response.";

      console.log("N8N Response Data:", n8nResponse.data);
      console.log("Message field:", n8nResponse.data?.message);
      console.log("Message type:", typeof n8nResponse.data?.message);

      // Handle different response structures - ensure we always extract a string
      if (n8nResponse.data?.message) {
        const messageField = n8nResponse.data.message;
        
        // If message is a string, use it directly
        if (typeof messageField === 'string') {
          aiResponseContent = messageField;
        } 
        // If message is an object with content property, extract the content
        else if (messageField && typeof messageField === 'object' && 'content' in messageField) {
          const content = messageField.content;
          // Make sure content is a string
          aiResponseContent = typeof content === 'string' ? content : String(content);
        }
        // Fallback: try to stringify if nothing else works
        else {
          aiResponseContent = String(messageField);
        }
      } 
      // If data itself is a string, use it
      else if (typeof n8nResponse.data === "string") {
        aiResponseContent = n8nResponse.data;
      }

      console.log("Extracted AI Response:", aiResponseContent);

      // Use actual RAG response from N8N
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponseContent,
        timestamp: "just now",
      };

      // Save AI response to database
      try {
        await supabase.from("messages").insert({
          chat_id: currentChatId,
          role: "assistant",
          content: aiResponseContent,
        });
      } catch (error) {
        console.error("Error saving AI message:", error);
      }

      setChats((prev) =>
        prev.map((chat) => (chat.id === currentChatId ? { ...chat, messages: [...chat.messages, aiMessage] } : chat)),
      );
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Hide loading state
      setIsAiLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
      id: Date.now().toString() + file.name,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + " KB",
    }));

    setUploadedFiles((prev) => [...prev, ...newFiles]);

    toast({
      title: "Files uploaded",
      description: `${newFiles.length} file(s) ready for reference`,
    });
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    try {
      toast({
        title: "Transcribing...",
        description: "Converting audio to text",
      });

      // Convert audio blob to base64
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Send to OpenAI STT via edge function
      const sttResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audio: base64Audio }),
      });

      if (!sttResponse.ok) {
        throw new Error("Failed to transcribe audio");
      }

      const { text } = await sttResponse.json();

      if (!text) {
        toast({
          title: "Error",
          description: "No speech detected in audio",
          variant: "destructive",
        });
        return;
      }

      // Display the transcribed text as a user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: "just now",
      };

      setChats((prev) =>
        prev.map((chat) => (chat.id === currentChatId ? { ...chat, messages: [...chat.messages, userMessage] } : chat)),
      );

      toast({
        title: "Transcribed",
        description: "Sending to N8N for processing",
      });

      // Show loading state
      setIsAiLoading(true);

      // Prepare conversation history for context
      const conversationHistory = currentChat?.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })) || [];

      // Now send the transcribed text to N8N with conversation history
      const n8nResponse = await sendTextToN8N(text, {
        chatId: currentChatId,
        source: "voice",
        originalFormat: "audio",
      }, conversationHistory);

      if (!n8nResponse.success) {
        toast({
          title: "Error",
          description: "Failed to process with N8N",
          variant: "destructive",
        });
        return;
      }

      // Handle N8N response
      let aiResponseContent = "Audio processed but no response received.";

      // Handle different response structures - ensure we always extract a string
      if (n8nResponse.data?.message) {
        const messageField = n8nResponse.data.message;
        
        // If message is a string, use it directly
        if (typeof messageField === 'string') {
          aiResponseContent = messageField;
        } 
        // If message is an object with content property, extract the content
        else if (messageField && typeof messageField === 'object' && 'content' in messageField) {
          const content = messageField.content;
          aiResponseContent = typeof content === 'string' ? content : String(content);
        }
        else {
          aiResponseContent = String(messageField);
        }
      }
      else if (n8nResponse.data?.data?.response) {
        aiResponseContent = String(n8nResponse.data.data.response);
      } else if (n8nResponse.data?.response) {
        aiResponseContent = String(n8nResponse.data.response);
      } else if (typeof n8nResponse.data === "string") {
        aiResponseContent = n8nResponse.data;
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponseContent,
        timestamp: "just now",
      };

      // Save both messages to database
      if (currentChatId && user) {
        try {
          await supabase.from("messages").insert([
            { chat_id: currentChatId, role: "user", content: text },
            { chat_id: currentChatId, role: "assistant", content: aiResponseContent },
          ]);
        } catch (error) {
          console.error("Error saving voice messages:", error);
        }
      }

      setChats((prev) =>
        prev.map((chat) => (chat.id === currentChatId ? { ...chat, messages: [...chat.messages, aiMessage] } : chat)),
      );
    } catch (error) {
      console.error("Error processing audio:", error);
      toast({
        title: "Error",
        description: "Failed to process audio",
        variant: "destructive",
      });
    } finally {
      // Hide loading state
      setIsAiLoading(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUploadFiles = async (files: File[]) => {
    const TEXT_EXTENSIONS = [
      ".txt",
      ".md",
      ".json",
      ".jsonl",
      ".csv",
      ".xml",
      ".yaml",
      ".yml",
      ".log",
      ".js",
      ".ts",
      ".tsx",
      ".html",
      ".css",
    ];

    const fileDataPromises = files.map(async (file) => {
      const extension = "." + file.name.split(".").pop()?.toLowerCase();
      const isTextFile = TEXT_EXTENSIONS.includes(extension);

      if (isTextFile) {
        // For text files, read as text
        const content = await file.text();
        return {
          name: file.name,
          content,
          isTextFile: true,
          fileType: file.type,
          fileSize: file.size,
        };
      } else {
        // For binary files, convert to base64
        return new Promise<any>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve({
              name: file.name,
              content: base64,
              isTextFile: false,
              fileType: file.type || "application/octet-stream",
              fileSize: file.size,
            });
          };
          reader.readAsDataURL(file);
        });
      }
    });

    const fileData = await Promise.all(fileDataPromises);

    try {
      const response = await supabase.functions.invoke("upload-to-rag", {
        body: { files: fileData },
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;
      const fileDataResolved = await Promise.all(fileDataPromises);
      const textFilesCount = fileDataResolved.filter((f) => f.isTextFile).length;
      const binaryFilesCount = fileDataResolved.filter((f) => !f.isTextFile).length;

      // Store binary file IDs for later processing
      const binaryFileIds = result.binaryFiles?.map((f: any) => f.id) || [];

      let message = "";
      if (textFilesCount > 0 && binaryFilesCount > 0) {
        message = `${textFilesCount} text file(s) uploaded to RAG, ${binaryFilesCount} binary file(s) stored`;
      } else if (textFilesCount > 0) {
        message = `${textFilesCount} file(s) uploaded to RAG storage`;
      } else {
        message = `${binaryFilesCount} binary file(s) stored`;
      }

      toast({
        title: "Success",
        description: message,
      });

      // Add to UI state
      const newFiles = await Promise.all(
        files.map(async (file, idx) => {
          const resolvedFileData = fileDataResolved[idx];
          const binaryFile = result.binaryFiles?.find((f: any) => f.name === file.name);

          return {
            id: Date.now().toString() + Math.random(),
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            isProcessed: resolvedFileData.isTextFile,
            isBinary: !resolvedFileData.isTextFile,
            fileId: binaryFile?.id,
          };
        }),
      );

      setUploadedFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    }
  };

  const handleProcessBinaryFiles = async () => {
    const binaryFiles = uploadedFiles.filter((f) => f.isBinary && !f.isProcessed && f.fileId);

    if (binaryFiles.length === 0) {
      toast({
        title: "No files to process",
        description: "All binary files have already been processed",
      });
      return;
    }

    try {
      const fileIds = binaryFiles.map((f) => f.fileId);

      const response = await supabase.functions.invoke("process-binary-files", {
        body: { fileIds },
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;

      toast({
        title: "Success",
        description: `Processed ${result.files.length} binary file(s) for RAG`,
      });

      // Update UI state
      setUploadedFiles((prev) =>
        prev.map((file) => {
          if (binaryFiles.find((bf) => bf.id === file.id)) {
            return { ...file, isProcessed: true };
          }
          return file;
        }),
      );
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "Error",
        description: "Failed to process binary files",
        variant: "destructive",
      });
    }
  };

  const handleToggleVoice = () => {
    setIsVoiceMode(!isVoiceMode);
    toast({
      title: isVoiceMode ? "Voice mode disabled" : "Voice mode enabled",
      description: isVoiceMode ? "Switched to text mode" : "You can now speak to the AI",
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen w-full bg-background">
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        currentName={renamingItem?.name || ""}
        onRename={handleRename}
        title={`Rename ${renamingItem?.type === "chat" ? "Chat" : "Project"}`}
        description={`Enter a new name for this ${renamingItem?.type}`}
      />

      {movingChat && (
        <ProjectDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
          chat={movingChat}
          projects={projects}
          onAssign={handleAssignToProject}
        />
      )}

      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel 
          defaultSize={20} 
          minSize={15} 
          maxSize={40}
          collapsible
          collapsedSize={0}
        >
          <ChatSidebar
            collapsed={sidebarCollapsed}
            chats={chats}
            projects={projects}
            currentChatId={currentChatId || ""}
            onNewChat={handleCreateNewChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onMoveToProject={handleMoveToProject}
            onAssignToProject={handleAssignToProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onRenameProject={handleRenameProject}
            onLogout={handleLogout}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={80} minSize={30}>
          <div className="flex flex-col h-full relative">
            {/* Header */}
            <div className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex items-center px-4 gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hover:bg-secondary"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg font-semibold">{currentChat?.title || "New Conversation"}</h1>
                <p className="text-sm text-muted-foreground">Ask questions, upload docs, or use voice</p>
              </div>
            </div>

            {/* Chat Container with Stars Background */}
            <div className="flex-1 relative overflow-hidden">
              <StarBackground />
              
              {/* Document Upload Floating Button */}
              <DocumentUpload
                files={uploadedFiles}
                onRemoveFile={handleRemoveFile}
                onUploadFiles={handleUploadFiles}
                onProcessBinaryFiles={handleProcessBinaryFiles}
              />
              
              {/* Messages */}
              <ScrollArea className="h-full">
                <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 min-h-full">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      timestamp={message.timestamp}
                    />
                  ))}
                  {isAiLoading && (
                    <ChatMessage
                      role="assistant"
                      content=""
                      isLoading={true}
                    />
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Input */}
            <ChatInput
              onSendMessage={handleSendMessage}
              onFileUpload={handleFileUpload}
              onAudioUpload={handleAudioUpload}
              isVoiceMode={isVoiceMode}
              onToggleVoice={handleToggleVoice}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Index;
