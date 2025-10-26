import {
    Edit2,
    FolderKanban,
    LogOut,
    MessageSquare,
    Plus,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";
import { useState } from "react";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

interface Chat {
    id: string;
    title: string;
    messages: Message[];
    timestamp: string;
    project_id?: string | null;
}

interface Project {
    id: string;
    name: string;
}

interface ChatSidebarProps {
    collapsed?: boolean;
    chats: Chat[];
    projects: Project[];
    currentChatId: string;
    onNewChat: () => void;
    onSelectChat: (chatId: string) => void;
    onDeleteChat: (chatId: string) => void;
    onRenameChat: (chatId: string) => void;
    onMoveToProject: (chatId: string) => void;
    onAssignToProject: (chatId: string, projectId: string | null) => void;
    onCreateProject: () => void;
    onDeleteProject: (projectId: string) => void;
    onRenameProject: (projectId: string) => void;
    onLogout: () => void;
}

const ChatSidebar = ({
    collapsed = false,
    chats,
    projects,
    currentChatId,
    onNewChat,
    onSelectChat,
    onDeleteChat,
    onRenameChat,
    onMoveToProject,
    onAssignToProject,
    onCreateProject,
    onDeleteProject,
    onRenameProject,
    onLogout,
}: ChatSidebarProps) => {
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const unassignedChats = chats.filter((chat) => !chat.project_id).slice(
        0,
        10,
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const chatId = active.id as string;
            const targetId = over.id as string;

            // If dropped on a project
            if (targetId.startsWith("project-")) {
                const projectId = targetId.replace("project-", "");
                onAssignToProject(chatId, projectId);
            } // If dropped on "Recent Chats" header
            else if (targetId === "recent-chats") {
                onAssignToProject(chatId, null);
            }
        }

        setActiveDragId(null);
    };

    return (
        <DndContext
            onDragEnd={handleDragEnd}
            onDragStart={(e) => setActiveDragId(e.active.id as string)}
        >
            <div
                className={cn(
                    "flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300",
                    collapsed ? "w-16" : "w-full",
                )}
            >
                <div className="p-4 flex items-center justify-between">
                    {!collapsed && (
                        <h2 className="text-lg font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                            Tacto Guide
                        </h2>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-sidebar-accent"
                        onClick={onNewChat}
                        title="New Chat"
                    >
                        <Plus className="h-5 w-5" />
                    </Button>
                </div>

                <ScrollArea className="flex-1 px-3">
                    <div className="space-y-6">
                        {/* Recent Chats - Droppable */}
                        <RecentChatsSection
                            collapsed={collapsed}
                            chats={unassignedChats}
                            currentChatId={currentChatId}
                            onSelectChat={onSelectChat}
                            onRenameChat={onRenameChat}
                            onMoveToProject={onMoveToProject}
                            onDeleteChat={onDeleteChat}
                        />

                        {!collapsed && (
                            <Separator className="bg-sidebar-border" />
                        )}

                        {/* Projects */}
                        <div>
                            <div className="flex items-center gap-2 px-2 mb-2">
                                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                                {!collapsed && (
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Projects
                                    </span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-auto h-5 w-5 hover:bg-sidebar-accent"
                                    onClick={onCreateProject}
                                    title="New Project"
                                >
                                    <Plus className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="space-y-1">
                                {projects.map((project) => {
                                    const projectChats = chats.filter((chat) =>
                                        chat.project_id === project.id
                                    );
                                    return (
                                        <ProjectSection
                                            key={project.id}
                                            project={project}
                                            projectChats={projectChats}
                                            collapsed={collapsed}
                                            currentChatId={currentChatId}
                                            onSelectChat={onSelectChat}
                                            onRenameChat={onRenameChat}
                                            onMoveToProject={onMoveToProject}
                                            onDeleteChat={onDeleteChat}
                                            onRenameProject={onRenameProject}
                                            onDeleteProject={onDeleteProject}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-sidebar-border">
                    <Button
                        variant="ghost"
                        className="w-full justify-start hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                        onClick={onLogout}
                    >
                        <LogOut className="h-4 w-4 mr-3" />
                        {!collapsed && <span>Logout</span>}
                    </Button>
                </div>
            </div>

            <DragOverlay>
                {activeDragId && (
                    <div className="bg-sidebar-accent border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
                        <MessageSquare className="h-4 w-4 text-primary inline mr-2" />
                        <span className="text-sm">
                            {chats.find((c) => c.id === activeDragId)?.title}
                        </span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
};

// Draggable Chat Item Component
const DraggableChat = ({
    chat,
    currentChatId,
    collapsed,
    onSelectChat,
    onRenameChat,
    onMoveToProject,
    onDeleteChat,
}: {
    chat: Chat;
    currentChatId: string;
    collapsed: boolean;
    onSelectChat: (id: string) => void;
    onRenameChat: (id: string) => void;
    onMoveToProject: (id: string) => void;
    onDeleteChat: (id: string) => void;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: chat.id,
    });

    return (
        <div
            ref={setNodeRef}
            className={cn("relative group/item", isDragging && "opacity-50")}
        >
            <Button
                {...listeners}
                {...attributes}
                variant="ghost"
                className={cn(
                    "w-full justify-start hover:bg-sidebar-accent group cursor-grab active:cursor-grabbing",
                    collapsed ? "px-2" : "pr-2",
                    currentChatId === chat.id &&
                        "bg-sidebar-accent border-l-2 border-primary",
                )}
                onClick={() => onSelectChat(chat.id)}
            >
                <MessageSquare className="h-4 w-4 mr-3 text-muted-foreground group-hover:text-primary transition-colors" />
                {!collapsed && (
                    <div className="flex-1 text-left overflow-hidden">
                        <p className="text-sm truncate group-hover:text-primary transition-colors">
                            {chat.title}
                        </p>
                        <p className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors">
                            {chat.messages.length} messages
                        </p>
                    </div>
                )}
            </Button>
            {!collapsed && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity bg-sidebar z-10 pr-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-primary/20 hover:text-primary"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRenameChat(chat.id);
                        }}
                        title="Rename"
                    >
                        <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-accent/20 hover:text-accent"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMoveToProject(chat.id);
                        }}
                        title="Move to project"
                    >
                        <FolderKanban className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id);
                        }}
                        title="Delete"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            )}
        </div>
    );
};

// Recent Chats Section (Droppable)
const RecentChatsSection = ({
    collapsed,
    chats,
    currentChatId,
    onSelectChat,
    onRenameChat,
    onMoveToProject,
    onDeleteChat,
}: {
    collapsed: boolean;
    chats: Chat[];
    currentChatId: string;
    onSelectChat: (id: string) => void;
    onRenameChat: (id: string) => void;
    onMoveToProject: (id: string) => void;
    onDeleteChat: (id: string) => void;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: "recent-chats",
    });

    return (
        <div ref={setNodeRef}>
            <div
                className={cn(
                    "flex items-center gap-2 px-2 mb-2 rounded-md transition-colors",
                    isOver && "bg-primary/10",
                )}
            >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                {!collapsed && (
                    <span className="text-sm font-medium text-muted-foreground">
                        Recent Chats
                    </span>
                )}
            </div>
            <div className="space-y-1">
                {chats.map((chat) => (
                    <DraggableChat
                        key={chat.id}
                        chat={chat}
                        currentChatId={currentChatId}
                        collapsed={collapsed}
                        onSelectChat={onSelectChat}
                        onRenameChat={onRenameChat}
                        onMoveToProject={onMoveToProject}
                        onDeleteChat={onDeleteChat}
                    />
                ))}
            </div>
        </div>
    );
};

// Project Section (Droppable)
const ProjectSection = ({
    project,
    projectChats,
    collapsed,
    currentChatId,
    onSelectChat,
    onRenameChat,
    onMoveToProject,
    onDeleteChat,
    onRenameProject,
    onDeleteProject,
}: {
    project: Project;
    projectChats: Chat[];
    collapsed: boolean;
    currentChatId: string;
    onSelectChat: (id: string) => void;
    onRenameChat: (id: string) => void;
    onMoveToProject: (id: string) => void;
    onDeleteChat: (id: string) => void;
    onRenameProject: (id: string) => void;
    onDeleteProject: (id: string) => void;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: `project-${project.id}`,
    });

    return (
        <div className="space-y-1">
            <div
                ref={setNodeRef}
                className={cn(
                    "relative group/item rounded-md transition-colors",
                    isOver && "bg-primary/10",
                )}
            >
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start hover:bg-sidebar-accent group",
                        collapsed ? "px-2" : "pr-2",
                    )}
                >
                    <FolderKanban className="h-4 w-4 mr-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    {!collapsed && (
                        <div className="flex-1 flex items-center justify-between">
                            <span className="text-sm truncate group-hover:text-primary transition-colors">
                                {project.name}
                            </span>
                            <span className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors">
                                {projectChats.length}
                            </span>
                        </div>
                    )}
                </Button>
                {!collapsed && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity bg-sidebar z-10 pr-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-primary/20 hover:text-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRenameProject(project.id);
                            }}
                            title="Rename"
                        >
                            <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteProject(project.id);
                            }}
                            title="Delete"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>
            {!collapsed &&
                projectChats.map((chat) => (
                    <div key={chat.id} className="ml-6">
                        <DraggableChat
                            chat={chat}
                            currentChatId={currentChatId}
                            collapsed={collapsed}
                            onSelectChat={onSelectChat}
                            onRenameChat={onRenameChat}
                            onMoveToProject={onMoveToProject}
                            onDeleteChat={onDeleteChat}
                        />
                    </div>
                ))}
        </div>
    );
};

export default ChatSidebar;
