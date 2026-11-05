import { randomUUID } from "node:crypto";

export function createPendingAnalysisStore({ ttlMs = 15 * 60 * 1000 } = {}) {
  const analyses = new Map();

  function removeExpired() {
    const now = Date.now();
    for (const [id, analysis] of analyses.entries()) {
      if (analysis.expiresAt <= now) analyses.delete(id);
    }
  }

  return {
    create(value) {
      removeExpired();
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      analyses.set(id, {
        ...value,
        id,
        createdAt,
        expiresAt: Date.now() + ttlMs,
      });
      return { id, createdAt };
    },
    get(id) {
      removeExpired();
      return analyses.get(id) || null;
    },
    remove(id) {
      analyses.delete(id);
    },
  };
}
