"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { X, MagnifyingGlass as Search, MagnifyingGlassPlus as ZoomIn, MagnifyingGlassMinus as ZoomOut, ArrowCounterClockwise as RotateCcw, ShareNetwork as Share2, Folder, FileText, BookOpenText, Tag, ArrowSquareOut as ExternalLink, Funnel as Filter, ArrowsOut as Maximize2, ArrowsIn as Minimize2, Faders as Sliders, Sparkle as Sparkles } from "@phosphor-icons/react";
import { Project, JournalEntry } from "@/lib/types";

interface GraphNode {
  id: string;
  label: string;
  type: "project" | "file" | "journal" | "tag";
  radius: number;
  color: string;
  glowColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  data?: any;
}

interface GraphLink {
  source: string;
  target: string;
  color: string;
}

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  journalEntries: JournalEntry[];
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToJournal?: (journalId: string) => void;
}

export const KnowledgeGraphModal: React.FC<KnowledgeGraphModalProps> = ({
  isOpen,
  onClose,
  projects,
  journalEntries,
  onNavigateToProject,
  onNavigateToJournal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Filters & Search
  const [filterProjects, setFilterProjects] = useState(true);
  const [filterJournal, setFilterJournal] = useState(true);
  const [filterFiles, setFilterFiles] = useState(true);
  const [filterTags, setFilterTags] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Pan & Zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);

  // Node & Edge Graph Construction
  const rawGraphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Set<string>();

    const centerX = 500;
    const centerY = 400;

    // 1. Projects
    projects.forEach((proj, idx) => {
      const angle = (idx / Math.max(projects.length, 1)) * Math.PI * 2;
      const dist = 180 + (idx % 3) * 40;
      const x = centerX + Math.cos(angle) * dist + (Math.random() - 0.5) * 40;
      const y = centerY + Math.sin(angle) * dist + (Math.random() - 0.5) * 40;

      const pId = `proj_${proj.id}`;
      nodes.push({
        id: pId,
        label: proj.name,
        type: "project",
        radius: 14,
        color: "#3b82f6", // Blue
        glowColor: "rgba(59, 130, 246, 0.6)",
        x,
        y,
        vx: 0,
        vy: 0,
        data: proj,
      });
      nodeMap.add(pId);

      // Files inside project
      proj.files.forEach((file, fIdx) => {
        const fId = `file_${proj.id}_${file.id}`;
        const fAngle = angle + ((fIdx + 1) / Math.max(proj.files.length + 1, 2)) * 0.8 - 0.4;
        const fDist = dist + 70 + (fIdx % 2) * 25;

        nodes.push({
          id: fId,
          label: file.name,
          type: "file",
          radius: 7,
          color: "#a855f7", // Purple
          glowColor: "rgba(168, 85, 247, 0.5)",
          x: centerX + Math.cos(fAngle) * fDist,
          y: centerY + Math.sin(fAngle) * fDist,
          vx: 0,
          vy: 0,
          data: file,
        });
        nodeMap.add(fId);

        links.push({
          source: pId,
          target: fId,
          color: "rgba(168, 85, 247, 0.25)",
        });
      });
    });

    // 2. Journal Entries
    const tagMap = new Map<string, string>(); // tag -> nodeId

    journalEntries.forEach((entry, idx) => {
      const angle = (idx / Math.max(journalEntries.length, 1)) * Math.PI * 2 + 0.5;
      const dist = 220 + (idx % 4) * 35;
      const jId = `journ_${entry.id}`;

      nodes.push({
        id: jId,
        label: entry.title,
        type: "journal",
        radius: 10,
        color: "#10b981", // Emerald
        glowColor: "rgba(16, 185, 129, 0.6)",
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        data: entry,
      });
      nodeMap.add(jId);

      // Link to project if assigned
      if (entry.projectId) {
        const targetProjId = `proj_${entry.projectId}`;
        if (nodeMap.has(targetProjId)) {
          links.push({
            source: jId,
            target: targetProjId,
            color: "rgba(59, 130, 246, 0.35)",
          });
        }
      }

      // Link to tags
      (entry.tags || []).forEach((t) => {
        const cleanTag = t.startsWith("#") ? t : `#${t}`;
        let tagId = tagMap.get(cleanTag);
        if (!tagId) {
          tagId = `tag_${cleanTag}`;
          tagMap.set(cleanTag, tagId);
          nodes.push({
            id: tagId,
            label: cleanTag,
            type: "tag",
            radius: 6,
            color: "#f59e0b", // Amber
            glowColor: "rgba(245, 158, 11, 0.5)",
            x: centerX + (Math.random() - 0.5) * 450,
            y: centerY + (Math.random() - 0.5) * 450,
            vx: 0,
            vy: 0,
            data: cleanTag,
          });
          nodeMap.add(tagId);
        }

        links.push({
          source: jId,
          target: tagId,
          color: "rgba(245, 158, 11, 0.22)",
        });
      });

      // Bilateral links parsing: [[Note Title]]
      const linkRegex = /\[\[(.*?)\]\]/g;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(entry.content)) !== null) {
        const targetTitle = linkMatch[1].trim().toLowerCase();
        const targetEntry = journalEntries.find((other) => other.title.trim().toLowerCase() === targetTitle);
        if (targetEntry && targetEntry.id !== entry.id) {
          links.push({
            source: jId,
            target: `journ_${targetEntry.id}`,
            color: "rgba(16, 185, 129, 0.45)",
          });
        }
      }
    });

    return { nodes, links };
  }, [projects, journalEntries]);

  // Filtered nodes and links based on checkboxes
  const { filteredNodes, filteredLinks } = useMemo(() => {
    const activeTypeSet = new Set<string>();
    if (filterProjects) activeTypeSet.add("project");
    if (filterJournal) activeTypeSet.add("journal");
    if (filterFiles) activeTypeSet.add("file");
    if (filterTags) activeTypeSet.add("tag");

    const validNodes = rawGraphData.nodes.filter((n) => activeTypeSet.has(n.type));
    const validNodeIds = new Set(validNodes.map((n) => n.id));

    const validLinks = rawGraphData.links.filter(
      (l) => validNodeIds.has(l.source) && validNodeIds.has(l.target)
    );

    return { filteredNodes: validNodes, filteredLinks: validLinks };
  }, [rawGraphData, filterProjects, filterJournal, filterFiles, filterTags]);

  // Force-Directed Physics & Canvas Render Loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Physics constants
    const repulsionStrength = 550;
    const springLength = 75;
    const springStrength = 0.045;
    const damping = 0.86;
    const centerGravity = 0.008;

    // Simulation loop
    const step = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Repulsion between nodes (Coulomb's law approximation)
      for (let i = 0; i < filteredNodes.length; i++) {
        const a = filteredNodes[i];
        for (let j = i + 1; j < filteredNodes.length; j++) {
          const b = filteredNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 320) {
            const force = (repulsionStrength / distSq) * (a.type === "project" || b.type === "project" ? 1.5 : 1);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // 2. Spring attraction along links (Hooke's law)
      const nodeIndexMap = new Map<string, GraphNode>();
      filteredNodes.forEach((n) => nodeIndexMap.set(n.id, n));

      for (const link of filteredLinks) {
        const src = nodeIndexMap.get(link.source);
        const tgt = nodeIndexMap.get(link.target);
        if (!src || !tgt) continue;

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - springLength;
        const force = displacement * springStrength;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // 3. Center gravity & update position
      for (const node of filteredNodes) {
        if (node === draggedNodeRef.current) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        // Center pull
        node.vx += (centerX - node.x) * centerGravity;
        node.vy += (centerY - node.y) * centerGravity;

        // Apply velocity with damping
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
      }

      // 4. Render
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.scale, transformRef.current.scale);

      // Draw Links
      ctx.lineWidth = 1.2;
      for (const link of filteredLinks) {
        const src = nodeIndexMap.get(link.source);
        const tgt = nodeIndexMap.get(link.target);
        if (!src || !tgt) continue;

        const isHoveredLink =
          hoveredNodeRef.current &&
          (hoveredNodeRef.current.id === src.id || hoveredNodeRef.current.id === tgt.id);

        ctx.strokeStyle = isHoveredLink ? "rgba(255, 255, 255, 0.6)" : link.color;
        ctx.lineWidth = isHoveredLink ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }

      // Draw Nodes
      for (const node of filteredNodes) {
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isNeighbor =
          hoveredNodeRef.current &&
          filteredLinks.some(
            (l) =>
              (l.source === hoveredNodeRef.current?.id && l.target === node.id) ||
              (l.target === hoveredNodeRef.current?.id && l.source === node.id)
          );

        const isSearchMatch =
          searchQuery.trim() &&
          node.label.toLowerCase().includes(searchQuery.trim().toLowerCase());

        // Outer Glow
        if (isHovered || isSelected || isSearchMatch) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = node.glowColor;
          ctx.fill();
        }

        // Main Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered || isSelected ? "#ffffff" : node.color;
        ctx.fill();

        ctx.strokeStyle = isSelected ? "#3b82f6" : "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        // Node Label
        if (isHovered || isSelected || isNeighbor || isSearchMatch || node.type === "project" || transformRef.current.scale > 1.2) {
          ctx.font = `${isHovered || isSelected ? "bold 12px" : "11px"} Inter, sans-serif`;
          ctx.fillStyle = isHovered || isSelected ? "#ffffff" : "rgba(241, 245, 249, 0.85)";
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.x, node.y + node.radius + 14);
        }
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, filteredNodes, filteredLinks, selectedNode, searchQuery]);

  // Coordinate Conversion Helper
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    return {
      x: (mouseX - transformRef.current.x) / transformRef.current.scale,
      y: (mouseY - transformRef.current.y) / transformRef.current.scale,
    };
  };

  // Canvas Mouse Interactions (Drag Node, Pan Canvas, Click)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    // Check if clicked on a node
    const clickedNode = filteredNodes.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6);
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      setSelectedNode(clickedNode);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      const { x, y } = getCanvasCoords(e);
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      return;
    }

    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hover detection
    const { x, y } = getCanvasCoords(e);
    const hovered = filteredNodes.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6);
    });

    hoveredNodeRef.current = hovered || null;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hovered ? "pointer" : "grab";
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(0.25, Math.min(3.5, transformRef.current.scale * zoomFactor));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom towards mouse pointer
    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newScale / transformRef.current.scale);
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newScale / transformRef.current.scale);
    transformRef.current.scale = newScale;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0f19] text-white select-none animate-in fade-in duration-200">
      {/* Top Knowledge Graph Toolbar */}
      <header className="h-14 px-4 border-b border-white/10 bg-slate-950/80 backdrop-blur-md flex items-center justify-between z-20 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Interactive Knowledge Graph</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {filteredNodes.length} Nodes • {filteredLinks.length} Connections
              </span>
            </div>
          </div>
        </div>

        {/* Center Search & Filters */}
        <div className="flex items-center gap-2">
          {/* Node Search Box */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-xs w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search nodes or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="hidden lg:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setFilterProjects(!filterProjects)}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium ${
                filterProjects ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Folder className="w-3 h-3" /> Projects
            </button>
            <button
              onClick={() => setFilterJournal(!filterJournal)}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium ${
                filterJournal ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <BookOpenText className="w-3 h-3" /> Journal
            </button>
            <button
              onClick={() => setFilterFiles(!filterFiles)}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium ${
                filterFiles ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="w-3 h-3" /> Files
            </button>
            <button
              onClick={() => setFilterTags(!filterTags)}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium ${
                filterTags ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Tag className="w-3 h-3" /> Tags
            </button>
          </div>
        </div>

        {/* View Controls & Close */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              transformRef.current = { x: 0, y: 0, scale: 1 };
              setSelectedNode(null);
            }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Reset Zoom & Pan"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 border border-white/15 hover:border-rose-500 text-white transition-all cursor-pointer"
            title="Close Knowledge Graph"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Graph Canvas Area */}
      <div className="flex-1 relative overflow-hidden bg-radial from-[#131929] via-[#0b0f19] to-[#06080e]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block touch-none"
        />

        {/* Legend Overlay at Bottom-Left */}
        <div className="absolute bottom-5 left-5 p-3 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-white/10 text-xs space-y-1.5 pointer-events-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Graph Legend
          </span>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" />
            <span>Proyek Workspace</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
            <span>Notion Journal & Catatan</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm" />
            <span>Dokumen Knowledge</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
            <span>Topik & Tag</span>
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            Klik simpul untuk melihat detail • Scroll untuk zoom
          </p>
        </div>

        {/* Selected Node Inspector Drawer at Bottom-Right */}
        {selectedNode && (
          <div className="absolute bottom-5 right-5 w-80 sm:w-96 p-4 rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl space-y-3 animate-in slide-in-from-bottom-3 z-30">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  style={{ backgroundColor: selectedNode.color }}
                  className="w-3 h-3 rounded-full flex-shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold text-white truncate">{selectedNode.label}</h3>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-semibold">
                    {selectedNode.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Content Snippet */}
            <div className="text-xs text-slate-300 max-h-32 overflow-y-auto leading-relaxed p-2.5 rounded-xl bg-white/5 border border-white/10 font-sans">
              {selectedNode.type === "journal" ? (
                selectedNode.data?.content?.slice(0, 240) || "No journal preview text"
              ) : selectedNode.type === "project" ? (
                selectedNode.data?.description || "Project Workspace"
              ) : selectedNode.type === "file" ? (
                `File: ${selectedNode.data?.name} (${selectedNode.data?.size ? Math.round(selectedNode.data.size / 1024) + " KB" : "Doc"})`
              ) : (
                `Tag Topic: ${selectedNode.label}`
              )}
            </div>

            {/* Navigation Button */}
            <div className="flex items-center justify-end gap-2 pt-1">
              {selectedNode.type === "journal" && onNavigateToJournal && (
                <button
                  onClick={() => {
                    onNavigateToJournal(selectedNode.data?.id);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <BookOpenText className="w-3.5 h-3.5" />
                  <span>Buka di Journal</span>
                </button>
              )}

              {selectedNode.type === "project" && onNavigateToProject && (
                <button
                  onClick={() => {
                    onNavigateToProject(selectedNode.data?.id);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Buka Proyek</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
