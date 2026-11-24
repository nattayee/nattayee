// Tiny JSON-file persistence. State survives restarts; writes are atomic (tmp file + rename).

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS } from "./config.js";
import { createAccount } from "./portfolio.js";

export function freshState(settings = DEFAULT_SETTINGS) {
  return {
    version: 1,
    settings: { ...settings },
    account: createAccount(settings.startingBalance),
    decisions: [],
    equityHistory: [],
    day: null,
    killSwitch: { active: false, reason: null, at: null },
    aiUsage: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    botEnabled: false,
  };
}

export class Store {
  constructor(dir) {
    this.file = dir ? path.join(dir, "state.json") : null;
    this.state = freshState();
    this.timer = null;
    if (this.file) {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.file)) {
        try {
          const loaded = JSON.parse(fs.readFileSync(this.file, "utf8"));
          this.state = { ...freshState(), ...loaded, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } };
        } catch (err) {
          const backup = `${this.file}.corrupt-${Date.now()}`;
          fs.renameSync(this.file, backup);
          console.warn(`[store] state.json unreadable (${err.message}); moved to ${backup}`);
        }
      }
    }
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }
}
