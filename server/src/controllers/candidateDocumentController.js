const supabase = require('../config/supabase');
const { extractDriveFileID, isGoogleDriveFileUrl } = require('../utils/drive');
const { streamDriveFileToResponse, sendDriveProxyError } = require('../utils/driveStream');
const { isStaffRole } = require('../utils/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createCandidateDocumentHandlers({ client = supabase, stream = streamDriveFileToResponse } = {}) {
  async function readCandidateHeadshot(req, res) {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    if (!isStaffRole(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return null;
    }
    if (!UUID.test(req.params.candidateId || '')) {
      res.status(400).json({ error: 'Invalid candidate ID' });
      return null;
    }

    const { data, error } = await client
      .from('candidates')
      .select('id, cycle_id, headshot')
      .eq('id', req.params.candidateId)
      .maybeSingle();

    if (error) throw new Error('Could not look up candidate headshot');
    if (!data?.cycle_id || !isGoogleDriveFileUrl(data.headshot)) {
      res.status(404).json({ error: 'Candidate headshot is not available' });
      return null;
    }
    return data;
  }

  async function headshotContent(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const candidate = await readCandidateHeadshot(req, res);
      if (!candidate) return;

      const storedVersion = extractDriveFileID(candidate.headshot);
      const requestedVersion = String(req.query.version || '').trim();
      if (!requestedVersion || requestedVersion !== storedVersion) {
        return res.status(409).json({ error: 'Headshot changed; reload its file link' });
      }

      return await stream(candidate.headshot, res, {
        fallbackContentType: 'image/jpeg',
        thumbnailSize: 320,
      });
    } catch (error) {
      return sendDriveProxyError(res, error, 'headshot');
    }
  }

  return { headshotContent };
}

module.exports = {
  createCandidateDocumentHandlers,
  ...createCandidateDocumentHandlers(),
};
