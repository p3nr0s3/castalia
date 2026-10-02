"use client";

import { useEffect } from "react";
import { AgentTask } from "@/lib/types";

interface UseScheduledAgentsProps {
  agents: AgentTask[];
  runningAgentIds: string[];
  onTriggerAgent: (agentId: string) => void;
}

export function useScheduledAgents({
  agents,
  runningAgentIds,
  onTriggerAgent,
}: UseScheduledAgentsProps) {
  // Request browser notification permission for scheduled agents
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Periodic check for due agents (client-side interval every 25 seconds)
  useEffect(() => {
    const schedulerInterval = setInterval(() => {
      const now = Date.now();
      agents.forEach((agent) => {
        if (
          agent.enabled &&
          agent.scheduleType !== "manual" &&
          agent.nextRun &&
          now >= agent.nextRun &&
          !runningAgentIds.includes(agent.id)
        ) {
          console.log(`[scheduler] Triggering scheduled Agent: ${agent.name}`);
          onTriggerAgent(agent.id);
        }
      });
    }, 25000);

    return () => clearInterval(schedulerInterval);
  }, [agents, runningAgentIds, onTriggerAgent]);
}
