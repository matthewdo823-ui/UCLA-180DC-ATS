const supabase = require('../config/supabase');
const { extractDriveFileID, isGoogleDriveFileUrl } = require('../utils/drive');
const { getSignedUrl } = require('../utils/documentStorage');
const { streamDriveFileToResponse, sendDriveProxyError } = require('../utils/driveStream');
const { firstRel } = require('../utils/supabaseHelpers');

const RESUME_LINK_TTL_SECONDS = 15 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createResumeFileHandlers({ client = supabase, sign = getSignedUrl, stream = streamDriveFileToResponse } = {}) {
  async function readResume(req, res) {
    // Same staff audience as the candidate profile, including historical cycles.
    // Resolve the source from a real resume row, never a caller-supplied URL.
    if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return null; }
    if (!['admin', 'member'].includes(req.user.role)) { res.status(403).json({ error: 'Insufficient permissions' }); return null; }
    if (!UUID.test(req.params.id || '')) { res.status(400).json({ error: 'Invalid resume ID' }); return null; }
    const { data, error } = await client.from('resumes')
      .select('id, candidate_id, cycle_id, file_url, candidates ( cycle_id )')
      .eq('id', req.params.id).maybeSingle();
    if (error) throw new Error('Could not look up resume');
    if (!data?.cycle_id || (data.candidate_id && firstRel(data.candidates)?.cycle_id !== data.cycle_id)) {
      res.status(404).json({ error: 'Resume not found' }); return null;
    }
    if (!isGoogleDriveFileUrl(data.file_url)) {
      res.status(404).json({ error: 'Resume file is not available' }); return null;
    }
    return data;
  }

  async function fileAccess(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const resume = await readResume(req, res);
      if (!resume) return;
      const driveId = extractDriveFileID(resume.file_url);
      const fallbackUrl = `/resume/${resume.id}/file-content?version=${encodeURIComponent(driveId)}`;
      let document;
      if (resume.candidate_id) {
        const { data, error } = await client.from('documents')
          .select('storage_path, source_version, content_type')
          .eq('candidate_id', resume.candidate_id).eq('cycle_id', resume.cycle_id)
          .eq('kind', 'resume').eq('drive_file_id', driveId).eq('sync_status', 'ready').maybeSingle();
        // Storage/schema availability must not break the already-authorized source.
        if (!error) document = data;
      }
      if (document?.storage_path) {
        let url;
        try { url = await sign(document.storage_path, RESUME_LINK_TTL_SECONDS); } catch { /* Drive fallback */ }
        if (url) return res.json({
          source: 'storage', url, fallbackUrl, version: document.source_version,
          contentType: document.content_type,
          expiresAt: Date.now() + RESUME_LINK_TTL_SECONDS * 1000,
        });
      }
      return res.json({ source: 'drive', url: fallbackUrl, fallbackUrl, version: driveId, expiresAt: null });
    } catch (error) {
      console.error('[resumeFile] Access resolution failed:', error.message);
      return res.status(502).json({ error: 'Could not resolve resume file' });
    }
  }

  async function fileContent(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const resume = await readResume(req, res);
      if (!resume) return;
      if (req.query.version !== extractDriveFileID(resume.file_url)) {
        return res.status(409).json({ error: 'Resume changed; reload its file link' });
      }
      return await stream(resume.file_url, res, { fallbackContentType: 'application/pdf' });
    } catch (error) {
      return sendDriveProxyError(res, error, 'resume');
    }
  }

  return { fileAccess, fileContent };
}

module.exports = { createResumeFileHandlers, ...createResumeFileHandlers() };
