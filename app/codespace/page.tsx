"use client";

import React, { useEffect, useState } from "react";
import { CodespaceView } from "@/components/CodespaceView";
import { OllamaModel, AppSettings } from "@/lib/types";
import { storage } from "@/lib/storage";
import { apiFetch } from "@/lib/apiClient";

export default function StandaloneCodespacePage() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());

  useEffect(() => {
    // Load models
    const fetchModels = async () => {
      try {
        const res = await apiFetch("/api/ollama/api/tags");
        if (res.ok) {
          const data = await res.json();
          const list: OllamaModel[] = data.models || [];
          setModels(list);
          if (list.length > 0 && !selectedModel) {
            setSelectedModel(list[0].name);
          }
        }
      } catch {}
    };
    fetchModels();
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-[var(--background)]">
      <CodespaceView
        models={models}
        selectedModel={selectedModel}
        apiKeys={settings.apiKeys}
        onSendToChat={(text) => {
          // If opened via window.open, post message to opener
          if (window.opener) {
            window.opener.postMessage({ type: "CASTALIA_SEND_TO_CHAT", text }, "*");
          }
        }}
        onClose={() => {
          if (window.opener) {
            window.close();
          }
        }}
      />
    </main>
  );
}
