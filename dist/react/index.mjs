// src/react/useEditSession.ts
import { useState, useCallback, useRef } from "react";
function useEditSession(sdk, pi, options) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const startSession = useCallback(
    async (mode) => {
      setLoading(true);
      setError(null);
      try {
        const newSession = sdk.createSession(pi, { mode });
        await newSession.load();
        setSession(newSession);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        optionsRef.current?.onError?.(err);
      } finally {
        setLoading(false);
      }
    },
    [sdk, pi]
  );
  const endSession = useCallback(() => {
    setSession(null);
    setStatus(null);
    setError(null);
  }, []);
  const submit = useCallback(
    async (note) => {
      if (!session) {
        setError("No active session");
        return void 0;
      }
      setSaving(true);
      setError(null);
      try {
        const result = await session.submit(note);
        optionsRef.current?.onSaved?.(result);
        if (result.reprocess) {
          setStatus({ phase: "reprocessing", saveComplete: true });
          const finalStatus = await session.waitForCompletion({
            onProgress: setStatus
          });
          setStatus(finalStatus);
          optionsRef.current?.onComplete?.(finalStatus);
        } else {
          const completeStatus = { phase: "complete", saveComplete: true };
          setStatus(completeStatus);
          optionsRef.current?.onComplete?.(completeStatus);
        }
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        setStatus({ phase: "error", saveComplete: false, error: err.message });
        optionsRef.current?.onError?.(err);
        return void 0;
      } finally {
        setSaving(false);
      }
    },
    [session]
  );
  const setPrompt = useCallback(
    (target, prompt) => {
      session?.setPrompt(target, prompt);
    },
    [session]
  );
  const setContent = useCallback(
    (component, content) => {
      session?.setContent(component, content);
    },
    [session]
  );
  const addCorrection = useCallback(
    (original, corrected, sourceFile) => {
      session?.addCorrection(original, corrected, sourceFile);
    },
    [session]
  );
  const setScope = useCallback(
    (scope) => {
      session?.setScope(scope);
    },
    [session]
  );
  return {
    session,
    loading,
    saving,
    status,
    error,
    startSession,
    endSession,
    submit,
    setPrompt,
    setContent,
    addCorrection,
    setScope
  };
}

// src/react/EditContext.tsx
import { createContext, useContext, useMemo } from "react";

// src/types.ts
var ArkeEditError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ArkeEditError";
  }
};
var EntityNotFoundError = class extends ArkeEditError {
  constructor(pi) {
    super(`Entity not found: ${pi}`, "ENTITY_NOT_FOUND", { pi });
    this.name = "EntityNotFoundError";
  }
};
var CASConflictError = class extends ArkeEditError {
  constructor(pi, expectedTip, actualTip) {
    super(
      `CAS conflict: entity ${pi} was modified (expected ${expectedTip}, got ${actualTip})`,
      "CAS_CONFLICT",
      { pi, expectedTip, actualTip }
    );
    this.name = "CASConflictError";
  }
};
var ReprocessError = class extends ArkeEditError {
  constructor(message, batchId) {
    super(message, "REPROCESS_ERROR", { batchId });
    this.name = "ReprocessError";
  }
};
var ValidationError = class extends ArkeEditError {
  constructor(message, field) {
    super(message, "VALIDATION_ERROR", { field });
    this.name = "ValidationError";
  }
};

// src/client.ts
var DEFAULT_RETRY_OPTIONS = {
  maxRetries: 5,
  initialDelayMs: 2e3,
  // Start with 2s delay (orchestrator needs time to initialize)
  maxDelayMs: 3e4,
  // Cap at 30s
  backoffMultiplier: 2
  // Double each retry
};
var ArkeClient = class {
  constructor(config) {
    this.ipfsWrapperUrl = config.ipfsWrapperUrl.replace(/\/$/, "");
    this.reprocessApiUrl = config.reprocessApiUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
    this.statusUrlTransform = config.statusUrlTransform;
  }
  /**
   * Sleep for a given number of milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Execute a fetch with exponential backoff retry on transient errors
   */
  async fetchWithRetry(url, options, retryOptions = DEFAULT_RETRY_OPTIONS) {
    let lastError = null;
    let delay = retryOptions.initialDelayMs;
    for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.status >= 500 && attempt < retryOptions.maxRetries) {
          lastError = new Error(`Server error: ${response.status} ${response.statusText}`);
          await this.sleep(delay);
          delay = Math.min(delay * retryOptions.backoffMultiplier, retryOptions.maxDelayMs);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < retryOptions.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(delay * retryOptions.backoffMultiplier, retryOptions.maxDelayMs);
        }
      }
    }
    throw lastError || new Error("Request failed after retries");
  }
  getHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }
  // ===========================================================================
  // IPFS Wrapper Operations
  // ===========================================================================
  /**
   * Fetch an entity by PI
   */
  async getEntity(pi) {
    const response = await fetch(`${this.ipfsWrapperUrl}/entities/${pi}`, {
      headers: this.getHeaders()
    });
    if (response.status === 404) {
      throw new EntityNotFoundError(pi);
    }
    if (!response.ok) {
      throw new ArkeEditError(
        `Failed to fetch entity: ${response.statusText}`,
        "FETCH_ERROR",
        { status: response.status }
      );
    }
    return response.json();
  }
  /**
   * Fetch content by CID
   */
  async getContent(cid) {
    const response = await fetch(`${this.ipfsWrapperUrl}/cat/${cid}`, {
      headers: this.getHeaders()
    });
    if (!response.ok) {
      throw new ArkeEditError(
        `Failed to fetch content: ${response.statusText}`,
        "FETCH_ERROR",
        { cid, status: response.status }
      );
    }
    return response.text();
  }
  /**
   * Upload content and get CID
   */
  async uploadContent(content, filename) {
    const formData = new FormData();
    const blob = new Blob([content], { type: "text/plain" });
    formData.append("file", blob, filename);
    const headers = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    const response = await fetch(`${this.ipfsWrapperUrl}/upload`, {
      method: "POST",
      headers,
      body: formData
    });
    if (!response.ok) {
      throw new ArkeEditError(
        `Failed to upload content: ${response.statusText}`,
        "UPLOAD_ERROR",
        { status: response.status }
      );
    }
    const result = await response.json();
    return result[0].cid;
  }
  /**
   * Update an entity with new components
   */
  async updateEntity(pi, update) {
    const response = await fetch(`${this.ipfsWrapperUrl}/entities/${pi}/versions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        expect_tip: update.expect_tip,
        components: update.components,
        components_remove: update.components_remove,
        note: update.note
      })
    });
    if (response.status === 409) {
      const entity = await this.getEntity(pi);
      throw new CASConflictError(
        pi,
        update.expect_tip,
        entity.manifest_cid
      );
    }
    if (!response.ok) {
      throw new ArkeEditError(
        `Failed to update entity: ${response.statusText}`,
        "UPDATE_ERROR",
        { status: response.status }
      );
    }
    return response.json();
  }
  // ===========================================================================
  // Reprocess API Operations
  // ===========================================================================
  /**
   * Trigger reprocessing for an entity
   */
  async reprocess(request) {
    const response = await fetch(`${this.reprocessApiUrl}/api/reprocess`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        pi: request.pi,
        phases: request.phases,
        cascade: request.cascade,
        options: request.options
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ReprocessError(
        error.message || `Reprocess failed: ${response.statusText}`,
        void 0
      );
    }
    return response.json();
  }
  /**
   * Get reprocessing status by batch ID
   *
   * Uses exponential backoff retry to handle transient 500 errors
   * that occur when the orchestrator is initializing.
   *
   * @param statusUrl - The status URL returned from reprocess()
   * @param isFirstPoll - If true, uses a longer initial delay (orchestrator warmup)
   */
  async getReprocessStatus(statusUrl, isFirstPoll = false) {
    const retryOptions = isFirstPoll ? { ...DEFAULT_RETRY_OPTIONS, initialDelayMs: 3e3 } : DEFAULT_RETRY_OPTIONS;
    const fetchUrl = this.statusUrlTransform ? this.statusUrlTransform(statusUrl) : statusUrl;
    const response = await this.fetchWithRetry(
      fetchUrl,
      { headers: this.getHeaders() },
      retryOptions
    );
    if (!response.ok) {
      throw new ArkeEditError(
        `Failed to fetch reprocess status: ${response.statusText}`,
        "STATUS_ERROR",
        { status: response.status }
      );
    }
    return response.json();
  }
};

// src/diff.ts
import * as Diff from "diff";
var DiffEngine = class {
  /**
   * Compute diff between two strings
   */
  static diff(original, modified) {
    const changes = Diff.diffLines(original, modified);
    const diffs = [];
    let lineNumber = 1;
    for (const change of changes) {
      if (change.added) {
        diffs.push({
          type: "addition",
          modified: change.value.trimEnd(),
          lineNumber
        });
      } else if (change.removed) {
        diffs.push({
          type: "deletion",
          original: change.value.trimEnd(),
          lineNumber
        });
      } else {
        const lines = change.value.split("\n").length - 1;
        lineNumber += lines;
      }
      if (change.added) {
        lineNumber += change.value.split("\n").length - 1;
      }
    }
    return diffs;
  }
  /**
   * Compute word-level diff for more granular changes
   */
  static diffWords(original, modified) {
    const changes = Diff.diffWords(original, modified);
    const diffs = [];
    for (const change of changes) {
      if (change.added) {
        diffs.push({
          type: "addition",
          modified: change.value
        });
      } else if (change.removed) {
        diffs.push({
          type: "deletion",
          original: change.value
        });
      }
    }
    return diffs;
  }
  /**
   * Create a ComponentDiff from original and modified content
   */
  static createComponentDiff(componentName, original, modified) {
    const diffs = this.diff(original, modified);
    const hasChanges = diffs.length > 0;
    let summary;
    if (!hasChanges) {
      summary = "No changes";
    } else {
      const additions = diffs.filter((d) => d.type === "addition").length;
      const deletions = diffs.filter((d) => d.type === "deletion").length;
      const parts = [];
      if (additions > 0) parts.push(`${additions} addition${additions > 1 ? "s" : ""}`);
      if (deletions > 0) parts.push(`${deletions} deletion${deletions > 1 ? "s" : ""}`);
      summary = parts.join(", ");
    }
    return {
      componentName,
      diffs,
      summary,
      hasChanges
    };
  }
  /**
   * Format diffs for AI prompt consumption
   */
  static formatForPrompt(diffs) {
    if (diffs.length === 0) {
      return "No changes detected.";
    }
    const lines = [];
    for (const diff of diffs) {
      const linePrefix = diff.lineNumber ? `Line ${diff.lineNumber}: ` : "";
      if (diff.type === "addition") {
        lines.push(`${linePrefix}+ ${diff.modified}`);
      } else if (diff.type === "deletion") {
        lines.push(`${linePrefix}- ${diff.original}`);
      } else if (diff.type === "change") {
        lines.push(`${linePrefix}"${diff.original}" \u2192 "${diff.modified}"`);
      }
    }
    return lines.join("\n");
  }
  /**
   * Format component diffs for AI prompt
   */
  static formatComponentDiffsForPrompt(componentDiffs) {
    const sections = [];
    for (const cd of componentDiffs) {
      if (!cd.hasChanges) continue;
      sections.push(`## Changes to ${cd.componentName}:`);
      sections.push(this.formatForPrompt(cd.diffs));
      sections.push("");
    }
    return sections.join("\n");
  }
  /**
   * Create a unified diff view
   */
  static unifiedDiff(original, modified, options) {
    const filename = options?.filename || "content";
    const patch = Diff.createPatch(filename, original, modified, "", "", {
      context: options?.context ?? 3
    });
    return patch;
  }
  /**
   * Extract corrections from diffs (specific text replacements)
   */
  static extractCorrections(original, modified, sourceFile) {
    const wordDiffs = Diff.diffWords(original, modified);
    const corrections = [];
    let i = 0;
    while (i < wordDiffs.length) {
      const current = wordDiffs[i];
      if (current.removed && i + 1 < wordDiffs.length && wordDiffs[i + 1].added) {
        const removed = current.value.trim();
        const added = wordDiffs[i + 1].value.trim();
        if (removed && added && removed !== added) {
          corrections.push({
            original: removed,
            corrected: added,
            sourceFile
          });
        }
        i += 2;
      } else {
        i++;
      }
    }
    return corrections;
  }
  /**
   * Check if two strings are meaningfully different
   * (ignoring whitespace differences)
   */
  static hasSignificantChanges(original, modified) {
    const normalizedOriginal = original.replace(/\s+/g, " ").trim();
    const normalizedModified = modified.replace(/\s+/g, " ").trim();
    return normalizedOriginal !== normalizedModified;
  }
};

// src/prompts.ts
var PromptBuilder = class {
  /**
   * Build prompt for AI-first mode (user provides instructions)
   */
  static buildAIPrompt(userPrompt, component, entityContext, currentContent) {
    const sections = [];
    sections.push(`## Instructions for ${component}`);
    sections.push(userPrompt);
    sections.push("");
    sections.push("## Entity Context");
    sections.push(`- PI: ${entityContext.pi}`);
    sections.push(`- Current version: ${entityContext.ver}`);
    if (entityContext.parentPi) {
      sections.push(`- Parent: ${entityContext.parentPi}`);
    }
    if (entityContext.childrenCount > 0) {
      sections.push(`- Children: ${entityContext.childrenCount}`);
    }
    sections.push("");
    if (currentContent) {
      sections.push(`## Current ${component} content for reference:`);
      sections.push("```");
      sections.push(currentContent.slice(0, 2e3));
      if (currentContent.length > 2e3) {
        sections.push("... [truncated]");
      }
      sections.push("```");
    }
    return sections.join("\n");
  }
  /**
   * Build prompt incorporating manual edits and diffs
   */
  static buildEditReviewPrompt(componentDiffs, corrections, component, userInstructions) {
    const sections = [];
    sections.push("## Manual Edits Made");
    sections.push("");
    sections.push("The following manual edits were made to this entity:");
    sections.push("");
    const diffContent = DiffEngine.formatComponentDiffsForPrompt(componentDiffs);
    if (diffContent) {
      sections.push(diffContent);
    }
    if (corrections.length > 0) {
      sections.push("## Corrections Identified");
      sections.push("");
      for (const correction of corrections) {
        const source = correction.sourceFile ? ` (in ${correction.sourceFile})` : "";
        sections.push(`- "${correction.original}" \u2192 "${correction.corrected}"${source}`);
      }
      sections.push("");
    }
    sections.push("## Instructions");
    if (userInstructions) {
      sections.push(userInstructions);
    } else {
      sections.push(
        `Update the ${component} to accurately reflect these changes. Ensure any corrections are incorporated and the content is consistent.`
      );
    }
    sections.push("");
    sections.push("## Guidance");
    switch (component) {
      case "pinax":
        sections.push(
          "Update metadata fields to reflect any corrections. Pay special attention to dates, names, and other factual information that may have been corrected."
        );
        break;
      case "description":
        sections.push(
          "Regenerate the description incorporating the changes. Maintain the overall tone and structure while ensuring accuracy based on the corrections."
        );
        break;
      case "cheimarros":
        sections.push(
          "Update the knowledge graph to reflect any new or corrected entities, relationships, and facts identified in the changes."
        );
        break;
    }
    return sections.join("\n");
  }
  /**
   * Build cascade-aware prompt additions
   */
  static buildCascadePrompt(basePrompt, cascadeContext) {
    const sections = [basePrompt];
    sections.push("");
    sections.push("## Cascade Context");
    sections.push("");
    sections.push(
      "This edit is part of a cascading update. After updating this entity, parent entities will also be updated to reflect these changes."
    );
    sections.push("");
    if (cascadeContext.path.length > 1) {
      sections.push(`Cascade path: ${cascadeContext.path.join(" \u2192 ")}`);
      sections.push(`Depth: ${cascadeContext.depth}`);
    }
    if (cascadeContext.stopAtPi) {
      sections.push(`Cascade will stop at: ${cascadeContext.stopAtPi}`);
    }
    sections.push("");
    sections.push(
      "Ensure the content accurately represents the source material so parent aggregations will be correct."
    );
    return sections.join("\n");
  }
  /**
   * Build a general prompt combining multiple instructions
   */
  static buildCombinedPrompt(generalPrompt, componentPrompt, component) {
    const sections = [];
    if (generalPrompt) {
      sections.push("## General Instructions");
      sections.push(generalPrompt);
      sections.push("");
    }
    if (componentPrompt) {
      sections.push(`## Specific Instructions for ${component}`);
      sections.push(componentPrompt);
      sections.push("");
    }
    if (sections.length === 0) {
      return `Regenerate the ${component} based on the current entity content.`;
    }
    return sections.join("\n");
  }
  /**
   * Build prompt for correction-based updates
   */
  static buildCorrectionPrompt(corrections) {
    if (corrections.length === 0) {
      return "";
    }
    const sections = [];
    sections.push("## Corrections Applied");
    sections.push("");
    sections.push("The following corrections were made to the source content:");
    sections.push("");
    for (const correction of corrections) {
      const source = correction.sourceFile ? ` in ${correction.sourceFile}` : "";
      sections.push(`- "${correction.original}" was corrected to "${correction.corrected}"${source}`);
      if (correction.context) {
        sections.push(`  Context: ${correction.context}`);
      }
    }
    sections.push("");
    sections.push(
      "Update the metadata and description to reflect these corrections. Previous content may have contained errors based on the incorrect text."
    );
    return sections.join("\n");
  }
  /**
   * Get component-specific regeneration guidance
   */
  static getComponentGuidance(component) {
    switch (component) {
      case "pinax":
        return "Extract and structure metadata including: institution, creator, title, date range, subjects, type, and other relevant fields. Ensure accuracy based on the source content.";
      case "description":
        return "Generate a clear, informative description that summarizes the entity content. Focus on what the material contains, its historical significance, and context. Write for a general audience unless otherwise specified.";
      case "cheimarros":
        return "Extract entities (people, places, organizations, events) and their relationships. Build a knowledge graph that captures the key facts and connections in the content.";
      default:
        return "";
    }
  }
};

// src/session.ts
var DEFAULT_SCOPE = {
  components: [],
  cascade: false
};
var DEFAULT_POLL_OPTIONS = {
  intervalMs: 2e3,
  timeoutMs: 3e5
  // 5 minutes
};
var EditSession = class {
  constructor(client, pi, config) {
    this.entity = null;
    this.loadedComponents = {};
    // AI mode state
    this.prompts = {};
    // Manual mode state
    this.editedContent = {};
    this.corrections = [];
    // Scope
    this.scope = { ...DEFAULT_SCOPE };
    // Execution state
    this.submitting = false;
    this.result = null;
    this.statusUrl = null;
    this.client = client;
    this.pi = pi;
    this.mode = config?.mode ?? "ai-prompt";
    this.aiReviewEnabled = config?.aiReviewEnabled ?? true;
  }
  // ===========================================================================
  // Loading
  // ===========================================================================
  /**
   * Load the entity and its key components
   */
  async load() {
    this.entity = await this.client.getEntity(this.pi);
    const priorityComponents = ["description.md", "pinax.json", "cheimarros.json"];
    await Promise.all(
      priorityComponents.map(async (name) => {
        const cid = this.entity.components[name];
        if (cid) {
          try {
            this.loadedComponents[name] = await this.client.getContent(cid);
          } catch {
          }
        }
      })
    );
  }
  /**
   * Load a specific component on demand
   */
  async loadComponent(name) {
    if (this.loadedComponents[name]) {
      return this.loadedComponents[name];
    }
    if (!this.entity) {
      throw new ValidationError("Session not loaded");
    }
    const cid = this.entity.components[name];
    if (!cid) {
      return void 0;
    }
    const content = await this.client.getContent(cid);
    this.loadedComponents[name] = content;
    return content;
  }
  /**
   * Get the loaded entity
   */
  getEntity() {
    if (!this.entity) {
      throw new ValidationError("Session not loaded. Call load() first.");
    }
    return this.entity;
  }
  /**
   * Get loaded component content
   */
  getComponents() {
    return { ...this.loadedComponents };
  }
  // ===========================================================================
  // AI Prompt Mode
  // ===========================================================================
  /**
   * Set a prompt for AI regeneration
   */
  setPrompt(target, prompt) {
    if (this.mode === "manual-only") {
      throw new ValidationError("Cannot set prompts in manual-only mode");
    }
    this.prompts[target] = prompt;
  }
  /**
   * Get all prompts
   */
  getPrompts() {
    return { ...this.prompts };
  }
  /**
   * Clear a prompt
   */
  clearPrompt(target) {
    delete this.prompts[target];
  }
  // ===========================================================================
  // Manual Edit Mode
  // ===========================================================================
  /**
   * Set edited content for a component
   */
  setContent(componentName, content) {
    if (this.mode === "ai-prompt") {
      throw new ValidationError("Cannot set content in ai-prompt mode");
    }
    this.editedContent[componentName] = content;
  }
  /**
   * Get all edited content
   */
  getEditedContent() {
    return { ...this.editedContent };
  }
  /**
   * Clear edited content for a component
   */
  clearContent(componentName) {
    delete this.editedContent[componentName];
  }
  /**
   * Add a correction (for OCR fixes, etc.)
   */
  addCorrection(original, corrected, sourceFile) {
    this.corrections.push({ original, corrected, sourceFile });
  }
  /**
   * Get all corrections
   */
  getCorrections() {
    return [...this.corrections];
  }
  /**
   * Clear corrections
   */
  clearCorrections() {
    this.corrections = [];
  }
  // ===========================================================================
  // Scope Configuration
  // ===========================================================================
  /**
   * Set the edit scope
   */
  setScope(scope) {
    this.scope = { ...this.scope, ...scope };
  }
  /**
   * Get the current scope
   */
  getScope() {
    return { ...this.scope };
  }
  // ===========================================================================
  // Preview & Summary
  // ===========================================================================
  /**
   * Get diffs for manual changes
   */
  getDiff() {
    const diffs = [];
    for (const [name, edited] of Object.entries(this.editedContent)) {
      const original = this.loadedComponents[name] || "";
      if (DiffEngine.hasSignificantChanges(original, edited)) {
        diffs.push(DiffEngine.createComponentDiff(name, original, edited));
      }
    }
    return diffs;
  }
  /**
   * Preview what prompts will be sent to AI
   */
  previewPrompt() {
    const result = {};
    if (!this.entity) return result;
    const entityContext = {
      pi: this.entity.pi,
      ver: this.entity.ver,
      parentPi: this.entity.parent_pi,
      childrenCount: this.entity.children_pi.length,
      currentContent: this.loadedComponents
    };
    for (const component of this.scope.components) {
      let prompt;
      if (this.mode === "ai-prompt") {
        const componentPrompt = this.prompts[component];
        const generalPrompt = this.prompts["general"];
        const combined = PromptBuilder.buildCombinedPrompt(generalPrompt, componentPrompt, component);
        prompt = PromptBuilder.buildAIPrompt(
          combined,
          component,
          entityContext,
          this.loadedComponents[`${component}.json`] || this.loadedComponents[`${component}.md`]
        );
      } else {
        const diffs = this.getDiff();
        const userInstructions = this.prompts["general"] || this.prompts[component];
        prompt = PromptBuilder.buildEditReviewPrompt(diffs, this.corrections, component, userInstructions);
      }
      if (this.scope.cascade) {
        prompt = PromptBuilder.buildCascadePrompt(prompt, {
          path: [this.entity.pi, this.entity.parent_pi || "root"].filter(Boolean),
          depth: 0,
          stopAtPi: this.scope.stopAtPi
        });
      }
      result[component] = prompt;
    }
    return result;
  }
  /**
   * Get a summary of pending changes
   */
  getChangeSummary() {
    const diffs = this.getDiff();
    const hasManualEdits = diffs.some((d) => d.hasChanges);
    return {
      mode: this.mode,
      hasManualEdits,
      editedComponents: Object.keys(this.editedContent),
      corrections: [...this.corrections],
      prompts: { ...this.prompts },
      scope: { ...this.scope },
      willRegenerate: [...this.scope.components],
      willCascade: this.scope.cascade,
      willSave: hasManualEdits,
      willReprocess: this.scope.components.length > 0
    };
  }
  // ===========================================================================
  // Execution
  // ===========================================================================
  /**
   * Submit changes (saves first if manual edits, then reprocesses)
   */
  async submit(note) {
    if (this.submitting) {
      throw new ValidationError("Submit already in progress");
    }
    if (!this.entity) {
      throw new ValidationError("Session not loaded. Call load() first.");
    }
    this.submitting = true;
    this.result = {};
    try {
      const diffs = this.getDiff();
      const hasManualEdits = diffs.some((d) => d.hasChanges);
      if (hasManualEdits) {
        const componentUpdates = {};
        for (const [name, content] of Object.entries(this.editedContent)) {
          const original = this.loadedComponents[name] || "";
          if (DiffEngine.hasSignificantChanges(original, content)) {
            const cid = await this.client.uploadContent(content, name);
            componentUpdates[name] = cid;
          }
        }
        const version = await this.client.updateEntity(this.pi, {
          expect_tip: this.entity.manifest_cid,
          components: componentUpdates,
          note
        });
        this.result.saved = {
          pi: version.pi,
          newVersion: version.ver,
          newTip: version.tip
        };
        this.entity.manifest_cid = version.tip;
        this.entity.ver = version.ver;
      }
      if (this.scope.components.length > 0) {
        const customPrompts = this.buildCustomPrompts();
        const reprocessResult = await this.client.reprocess({
          pi: this.pi,
          phases: this.scope.components,
          cascade: this.scope.cascade,
          options: {
            stop_at_pi: this.scope.stopAtPi,
            custom_prompts: customPrompts,
            custom_note: note
          }
        });
        this.result.reprocess = reprocessResult;
        this.statusUrl = reprocessResult.status_url;
      }
      return this.result;
    } finally {
      this.submitting = false;
    }
  }
  /**
   * Wait for reprocessing to complete
   */
  async waitForCompletion(options) {
    const opts = { ...DEFAULT_POLL_OPTIONS, ...options };
    if (!this.statusUrl) {
      return {
        phase: "complete",
        saveComplete: true
      };
    }
    const startTime = Date.now();
    let isFirstPoll = true;
    while (true) {
      const status = await this.client.getReprocessStatus(this.statusUrl, isFirstPoll);
      isFirstPoll = false;
      const editStatus = {
        phase: status.status === "DONE" ? "complete" : status.status === "ERROR" ? "error" : "reprocessing",
        saveComplete: true,
        reprocessStatus: status,
        error: status.error
      };
      if (opts.onProgress) {
        opts.onProgress(editStatus);
      }
      if (status.status === "DONE" || status.status === "ERROR") {
        return editStatus;
      }
      if (Date.now() - startTime > opts.timeoutMs) {
        return {
          phase: "error",
          saveComplete: true,
          reprocessStatus: status,
          error: "Timeout waiting for reprocessing to complete"
        };
      }
      await new Promise((resolve) => setTimeout(resolve, opts.intervalMs));
    }
  }
  /**
   * Get current status without waiting
   */
  async getStatus() {
    if (!this.statusUrl) {
      return {
        phase: this.result?.saved ? "complete" : "idle",
        saveComplete: !!this.result?.saved
      };
    }
    const status = await this.client.getReprocessStatus(this.statusUrl);
    return {
      phase: status.status === "DONE" ? "complete" : status.status === "ERROR" ? "error" : "reprocessing",
      saveComplete: true,
      reprocessStatus: status,
      error: status.error
    };
  }
  // ===========================================================================
  // Private Helpers
  // ===========================================================================
  buildCustomPrompts() {
    const custom = {};
    if (this.mode === "ai-prompt") {
      if (this.prompts["general"]) custom.general = this.prompts["general"];
      if (this.prompts["pinax"]) custom.pinax = this.prompts["pinax"];
      if (this.prompts["description"]) custom.description = this.prompts["description"];
      if (this.prompts["cheimarros"]) custom.cheimarros = this.prompts["cheimarros"];
    } else {
      const diffs = this.getDiff();
      const diffContext = DiffEngine.formatComponentDiffsForPrompt(diffs);
      const correctionContext = PromptBuilder.buildCorrectionPrompt(this.corrections);
      const basePrompt = [diffContext, correctionContext, this.prompts["general"]].filter(Boolean).join("\n\n");
      if (basePrompt) {
        custom.general = basePrompt;
      }
      if (this.prompts["pinax"]) custom.pinax = this.prompts["pinax"];
      if (this.prompts["description"]) custom.description = this.prompts["description"];
      if (this.prompts["cheimarros"]) custom.cheimarros = this.prompts["cheimarros"];
    }
    return custom;
  }
};

// src/sdk.ts
var ArkeEditSDK = class {
  constructor(config) {
    this.client = new ArkeClient(config);
  }
  /**
   * Create a new edit session for an entity
   *
   * @param pi - The entity PI to edit
   * @param config - Optional session configuration
   * @returns A new EditSession instance
   */
  createSession(pi, config) {
    return new EditSession(this.client, pi, config);
  }
  /**
   * Get the underlying API client (for advanced usage)
   */
  getClient() {
    return this.client;
  }
};

// src/react/EditContext.tsx
import { jsx } from "react/jsx-runtime";
var EditContext = createContext(null);
function EditProvider({ config, children }) {
  const sdk = useMemo(() => new ArkeEditSDK(config), [config]);
  const value = useMemo(() => ({ sdk }), [sdk]);
  return /* @__PURE__ */ jsx(EditContext.Provider, { value, children });
}
function useEditContext() {
  const context = useContext(EditContext);
  if (!context) {
    throw new Error("useEditContext must be used within an EditProvider");
  }
  return context;
}
export {
  EditProvider,
  useEditContext,
  useEditSession
};
//# sourceMappingURL=index.mjs.map