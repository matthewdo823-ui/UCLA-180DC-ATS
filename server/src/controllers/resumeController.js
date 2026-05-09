const supabase = require('../config/supabase');
const axios = require('axios');
const { extractDriveFileID, toDownloadURL } = require('../utils/drive');

// Gets next resume row
exports.getNextResume = async (req, res) => {
    console.log("HIT /next-resume");

    const { data, error } = await supabase
        .from('resumes')
        .select(`*,
            candidates(year)
        `)
        .order('review_count', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "No resumes found" });

    const fileID = extractDriveFileID(data.file_url);

    if (!fileID) {
        return res.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    console.log("abouta pass file url: " + accessable_file_url);
    return res.json({
        ...data,
        "file_url": accessable_file_url
    });
};

// Saves review 
exports.saveReview = async (req, res) => {
    const { resume_id, scores, notes, decision } = req.body;

    // storing review
    const { error: reviewError } = await supabase
        .from('resume_reviews')
        .insert({ resume_id, scores, notes, decision });

    if (reviewError) return res.status(500).json({ error: reviewError.message });

    // increment
    const { error: countError } = await supabase.rpc(
        'increment_review_count', { resume_id_input: resume_id }
    );

    if (countError) return res.status(500).json({ error: countError.message });

    return res.json({ success: true });
};

// Gets file link from resume 
exports.getResumeFile = async (req, res) => {
    const { data, error } = await supabase
        .from('resumes')
        .select('file_url')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(404).json({ error: error.message });

    const fileID = extractDriveFileID(data.file_url);

    if (!fileID) {
        return res.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    return res.json({
        ...data,
        "file_url": accessable_file_url
    });
};

// Reverse proxy for file streaming (streams drive pdf to frontend)
exports.viewPdf = async (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send("No URL provided");
    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        res.setHeader('Content-Type', 'application/pdf');
        response.data.pipe(res);
    } catch (err) {
        console.error("Proxy error: ", err.message);
        res.status(500).send("Error fetching pdf from drive");
    }
};
