"use client";

import { Stack as Blocks, Plus, MagnifyingGlass as Search, X, Terminal, Globe, Faders as Sliders, Trash as Trash2, Info, SpinnerGap as Loader2, ArrowsClockwise as RefreshCw, CheckCircle as CheckCircle2, XCircle } from "@phosphor-icons/react";
import type { SettingsCtx } from "../SettingsModal";

export function ConnectorsSection({ ctx }: { ctx: SettingsCtx }) {
  const {
    configuringConnector,
    connApiKey,
    connBridgeType,
    connDescription,
    connEndpoint,
    connName,
    connWebhookUrl,
    connectorSearch,
    filteredConnectors,
    handleDeleteConnector,
    handleSaveConnectorConfig,
    handleTestConnectorConnection,
    handleToggleConnector,
    isTestingConn,
    openAddBridgeModal,
    openEditBridgeModal,
    setConfiguringConnector,
    setConnApiKey,
    setConnBridgeType,
    setConnDescription,
    setConnEndpoint,
    setConnName,
    setConnWebhookUrl,
    setConnectorSearch,
    testResult,
  } = ctx;
  return (
<div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                      <Blocks className="w-4 h-4 text-blue-400" />
                      <span>Custom Connectors & Bridges</span>
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Connect Ollama Chat to external webhooks (Discord, Slack, custom APIs) or local desktop applications via bridges.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddBridgeModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-all cursor-pointer self-start sm:self-auto shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Bridge</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative flex items-center w-full">
                  <Search className="absolute left-3 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                  <input
                    type="text"
                    value={connectorSearch}
                    onChange={(e) => setConnectorSearch(e.target.value)}
                    placeholder="Search bridges by name, description, endpoint, or type..."
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-2xs"
                  />
                  {connectorSearch && (
                    <button
                      type="button"
                      onClick={() => setConnectorSearch("")}
                      className="absolute right-2.5 p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Bridges Grid */}
                {filteredConnectors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--sidebar-bg)]/40">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mb-3">
                      <Blocks className="w-6 h-6 text-blue-400/60" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No custom bridges found</p>
                    <p className="text-xs text-[var(--muted)] max-w-sm leading-relaxed mb-4">
                      Connect Ollama to any webhook (Discord, Slack, automation webhook) or local desktop app (like Blender or OBS) by adding your own bridge.
                    </p>
                    <button
                      type="button"
                      onClick={openAddBridgeModal}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add First Bridge</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredConnectors.map((conn) => (
                      <div
                        key={conn.id}
                        className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-2xs"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0">
                                {conn.customBridgeType === "local-http" ? (
                                  <Terminal className="w-4 h-4 text-purple-400" />
                                ) : (
                                  <Globe className="w-4 h-4 text-blue-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-xs text-[var(--foreground)] flex items-center gap-1.5 truncate">
                                  <span className="truncate">{conn.name}</span>
                                  {conn.isLiveConnected && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 flex-shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      Live
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
                                  {conn.customBridgeType === "local-http" ? "Local App Bridge" : "Webhook Bridge"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditBridgeModal(conn)}
                                className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-blue-400 transition-colors cursor-pointer"
                                title="Configure Bridge"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteConnector(conn.id)}
                                className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Bridge"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <label className="relative inline-flex items-center cursor-pointer ml-1">
                                <input
                                  type="checkbox"
                                  checked={conn.installed}
                                  onChange={() => handleToggleConnector(conn.id)}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4 bg-[var(--card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                              </label>
                            </div>
                          </div>

                          <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                            {conn.description}
                          </p>

                          {conn.statusMessage && (
                            <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-0.5 truncate">
                              {conn.statusMessage}
                            </div>
                          )}

                          <p className="text-[10px] text-[var(--muted)] font-mono truncate bg-[var(--card-bg)] px-2 py-1 rounded-lg border border-[var(--card-border)]">
                            {conn.customBridgeType === "local-http" ? (conn.endpoint || "No endpoint configured") : (conn.webhookUrl || "No webhook URL configured")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Helper info tip */}
                <div className="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex items-start gap-2.5 text-[11px] text-[var(--muted)] leading-relaxed">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Chat Trigger: </span>
                    You can trigger any bridge directly from the chat input with <code className="px-1.5 py-0.5 rounded bg-black/20 text-blue-300 font-mono">/bridge &lt;bridge-id&gt; &lt;message&gt;</code>.
                  </div>
                </div>

                {/* Bridge Configuration Modal / Overlay */}
                {configuringConnector && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 animate-in fade-in duration-150">
                    <div className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl p-5 space-y-4 text-[var(--foreground)]">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
                        <div className="font-bold text-sm flex items-center gap-2">
                          <Blocks className="w-4 h-4 text-blue-400" />
                          <span>{configuringConnector.id ? "Configure Custom Bridge" : "Add Custom Bridge"}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfiguringConnector(null)}
                          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Bridge Name</label>
                          <input
                            type="text"
                            value={connName}
                            onChange={(e) => setConnName(e.target.value)}
                            placeholder="e.g. Discord Alerts or Blender RPC"
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Description</label>
                          <input
                            type="text"
                            value={connDescription}
                            onChange={(e) => setConnDescription(e.target.value)}
                            placeholder="Brief description of what this bridge connects to"
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Bridge Protocol Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setConnBridgeType("webhook")}
                              className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                                connBridgeType === "webhook"
                                  ? "border-blue-500/60 bg-blue-500/10 text-blue-400 font-semibold"
                                  : "border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--muted)]"
                              }`}
                            >
                              <div className="font-semibold text-xs flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5" /> Webhook (POST)
                              </div>
                              <div className="text-[10px] opacity-75 mt-0.5">Slack, Discord, external URL</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConnBridgeType("local-http")}
                              className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                                connBridgeType === "local-http"
                                  ? "border-purple-500/60 bg-purple-500/10 text-purple-400 font-semibold"
                                  : "border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--muted)]"
                              }`}
                            >
                              <div className="font-semibold text-xs flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5" /> Local App (HTTP)
                              </div>
                              <div className="text-[10px] opacity-75 mt-0.5">127.0.0.1 / localhost server</div>
                            </button>
                          </div>
                        </div>

                        {connBridgeType === "webhook" ? (
                          <div>
                            <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Webhook URL</label>
                            <input
                              type="text"
                              value={connWebhookUrl}
                              onChange={(e) => setConnWebhookUrl(e.target.value)}
                              placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                              className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Local App Endpoint</label>
                            <input
                              type="text"
                              value={connEndpoint}
                              onChange={(e) => setConnEndpoint(e.target.value)}
                              placeholder="http://127.0.0.1:8080/api or http://localhost:9000"
                              className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                            Authorization Token / API Key <span className="font-normal text-[10px]">(Optional)</span>
                          </label>
                          <input
                            type="password"
                            value={connApiKey}
                            onChange={(e) => setConnApiKey(e.target.value)}
                            placeholder="Bearer token or secret key"
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] font-mono text-[11px] focus:outline-none"
                          />
                        </div>

                        {/* Test Connection Button & Result */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={handleTestConnectorConnection}
                            disabled={isTestingConn || (!connWebhookUrl && !connEndpoint)}
                            className="w-full py-1.5 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] disabled:opacity-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {isTestingConn ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Testing Bridge Connection...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Test Bridge Connectivity</span>
                              </>
                            )}
                          </button>

                          {testResult && (
                            <div
                              className={`mt-2 p-2.5 rounded-xl text-xs leading-relaxed flex items-start gap-2 ${
                                testResult.success
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {testResult.success ? (
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              )}
                              <span>{testResult.message}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--card-border)]">
                        <button
                          type="button"
                          onClick={() => setConfiguringConnector(null)}
                          className="px-3.5 py-1.5 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveConnectorConfig}
                          disabled={!connName.trim()}
                          className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white transition-all cursor-pointer shadow-xs"
                        >
                          Save Bridge
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
  );
}
