import api from './api';

export const papersApi = {
  list: () => api.get('/papers').then((r) => r.data),
  create: (title) => api.post('/papers', { title }).then((r) => r.data),
  get: (id) => api.get(`/papers/${id}`).then((r) => r.data),
  remove: (id) => api.delete(`/papers/${id}`).then((r) => r.data),
  presets: () => api.get('/papers/presets').then((r) => r.data),

  chat: (id, message, opts = {}) =>
    api
      .post(`/papers/${id}/chat`, {
        message,
        phase: opts.phase || 'intake',
        target_section_key: opts.targetSectionKey || null,
      })
      .then((r) => r.data),

  generateTemplate: (id) =>
    api.post(`/papers/${id}/generate-template`).then((r) => r.data),

  draftSection: (id, key) =>
    api.post(`/papers/${id}/sections/${key}/draft`).then((r) => r.data),

  saveSection: (id, key, body_md) =>
    api.patch(`/papers/${id}/sections/${key}`, { body_md }).then((r) => r.data),

  listAssets: (id) => api.get(`/papers/${id}/assets`).then((r) => r.data),

  uploadAsset: (id, file, label = '', caption = '') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label);
    fd.append('caption', caption);
    return api
      .post(`/papers/${id}/assets`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  export: (id, format = 'md') =>
    api.post(`/papers/${id}/export`, null, { params: { format } }).then((r) => r.data),

  runAudit: (id) => api.post(`/papers/${id}/audit`).then((r) => r.data),
  listAudits: (id) => api.get(`/papers/${id}/audits`).then((r) => r.data),
  getAudit: (auditId) => api.get(`/papers/audits/${auditId}`).then((r) => r.data),

  // Render the saved audit report as a downloadable PDF. Resolves with
  // { url, key, format, asset_id } where url is a presigned MinIO link.
  exportAudit: (projectId, auditId) =>
    api
      .post(`/papers/${projectId}/audits/${auditId}/export`)
      .then((r) => r.data),

  // Targeted single-snippet fix. Returns { section_update, old_snippet,
  // new_snippet, matched } — the caller patches the section locally and
  // updates the PDF text overlay by replacing old_snippet on the matching
  // text run.
  applyImprovement: (id, improvement) =>
    api
      .post(`/papers/${id}/improvements/apply`, {
        section_key: improvement.section_key || null,
        title: improvement.title || '',
        detail: improvement.detail || '',
        suggested_instruction: improvement.suggested_instruction || '',
      })
      .then((r) => r.data),

  // Verify-Paper edit layer: GET returns the saved overlay state, PUT
  // replaces it. Frontend owns the canonical edit map during a session;
  // these endpoints just give it persistence across reloads + re-verify.
  getEdits: (id) => api.get(`/papers/${id}/edits`).then((r) => r.data),
  saveEdits: (id, edits) =>
    api.put(`/papers/${id}/edits`, { edits }).then((r) => r.data),

  // Upload a PDF/DOCX, parse it into sections, persist as a PaperProject.
  // Resolves with ProjectMeta — caller navigates to /papers/:id and the
  // existing canvas takes over the verify / edit / re-verify / export flow.
  verifyUpload: (file, paperType) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('paper_type', paperType || 'generic');
    return api
      .post('/papers/verify-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};

// SSE-stream the audit. Calls onStage({stage, label}) per progress event and
// onDone(auditDetail) when the final report arrives. onError fires on any
// stream error. Returns a cancel function.
export function streamAudit(projectId, { onStage, onDone, onError }) {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${base}/papers/${projectId}/audit/stream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onError?.(new Error(`HTTP ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) {
              onError?.(new Error(payload.error));
              continue;
            }
            if (payload.done && payload.audit) {
              onDone?.(payload.audit);
              continue;
            }
            if (payload.stage) onStage?.(payload);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e);
    }
  })();

  return () => controller.abort();
}

// Stream tokens for a section draft. Returns a cancel function.
// SSE via fetch (cannot use EventSource because we need the Authorization header).
export function streamSectionDraft(projectId, sectionKey, onDelta, onDone, onError) {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `${base}/papers/${projectId}/sections/${sectionKey}/stream`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );
      if (!res.ok || !res.body) {
        onError?.(new Error(`HTTP ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) onDelta?.(payload.delta);
            if (payload.done) onDone?.(payload);
            if (payload.error) onError?.(new Error(payload.error));
          } catch (e) {
            // ignore malformed frame
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e);
    }
  })();

  return () => controller.abort();
}
