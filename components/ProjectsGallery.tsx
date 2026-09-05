"use client";

import React, { useState } from "react";
import { Search, ArrowUpDown, Plus, Sparkles, Folder, ArrowUpRight, Pin, PanelLeft, PanelLeftClose } from "lucide-react";
import { Project } from "@/lib/types";

interface ProjectsGalleryProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onOpenNewProjectModal: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const ProjectsGallery: React.FC<ProjectsGalleryProps> = ({
  projects,
  onSelectProject,
  onOpenNewProjectModal,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");

  // Format date helper (e.g. "Aug 15")
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Recent";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const filteredProjects = projects
    .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--background)] text-[var(--foreground)] px-4 sm:px-8 py-8 sm:py-12 touch-scroll">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Bar matching Claude Projects Overview */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer"
                title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
              </button>
            )}
            <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[var(--foreground)]">
              Projects
            </h1>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortBy(sortBy === "recent" ? "name" : "recent")}
              className="p-2 rounded-full border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              title={`Sorting by ${sortBy === "recent" ? "Recently Updated" : "Alphabetical"}`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* New Project Pill Button */}
            <button
              onClick={onOpenNewProjectModal}
              className="px-4 py-1.5 rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New project</span>
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Grid matching Claude Projects Cards */}
        {filteredProjects.length === 0 ? (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mx-auto text-[var(--muted)]">
              <Folder className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--foreground)]">No projects found</h3>
              <p className="text-xs text-[var(--muted)]">
                {searchQuery
                  ? `No projects matching "${searchQuery}"`
                  : "Create a project to organize chats, files, and custom instructions together."}
              </p>
            </div>
            <button
              onClick={onOpenNewProjectModal}
              className="px-4 py-2 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {filteredProjects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj.id)}
                className="group relative p-5 rounded-2xl bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] hover:border-[var(--muted)]/40 transition-all duration-150 cursor-pointer flex flex-col justify-between min-h-[140px] shadow-2xs hover:shadow-xs"
              >
                {/* Top: Title & Arrow */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm sm:text-base font-medium text-[var(--foreground)] truncate">
                    {proj.name}
                  </h3>
                  <ArrowUpRight className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors flex-shrink-0" />
                </div>

                {/* Middle: Optional Description or Files summary */}
                {proj.description ? (
                  <p className="text-xs text-[var(--muted)] line-clamp-2 my-2">
                    {proj.description}
                  </p>
                ) : (
                  <div className="my-2" />
                )}

                {/* Bottom: Date & File count */}
                <div className="flex items-center justify-between text-xs text-[var(--muted)] font-sans pt-1">
                  <span>{formatDate(proj.updatedAt || proj.createdAt)}</span>
                  {proj.files && proj.files.length > 0 && (
                    <span className="text-[11px] text-[var(--muted)] opacity-80 font-mono">
                      {proj.files.length} {proj.files.length === 1 ? "file" : "files"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsGallery;
