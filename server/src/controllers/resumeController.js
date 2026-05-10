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
        .insert({ resume_id, scores, notes });

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

// Gets scoreboard data
exports.getScoreboard = async (req, res) => {
    try {
        const { data: reviews, error: reviewError } = await supabase
            .from('resume_reviews')
            .select(`
                *,
                resumes (
                    id,
                    name,
                    candidates ( major )
                )
            `);
            
        if (reviewError) throw reviewError;

        const { count: totalApplicants, error: countError } = await supabase
            .from('resumes')
            .select('*', { count: 'exact', head: true });
            
        if (countError) throw countError;

        const candidateMap = {};
        let totalScoreSum = 0;
        let reviewCount = 0;

        reviews.forEach(review => {
            if (!review.resumes) return;
            const resumeId = review.resumes.id;
            
            let reviewScore = 0;
            if (review.scores) {
                Object.values(review.scores).forEach(val => reviewScore += val);
            }
            
            totalScoreSum += reviewScore;
            reviewCount++;

            if (!candidateMap[resumeId]) {
                candidateMap[resumeId] = {
                    id: resumeId,
                    name: review.resumes.name || 'Unknown',
                    major: review.resumes.candidates?.major || 'Undeclared',
                    totalScore: 0,
                    numReviews: 0,
                };
            }
            
            candidateMap[resumeId].totalScore += reviewScore;
            candidateMap[resumeId].numReviews++;
        });

        const candidates = Object.values(candidateMap).map(c => ({
            id: c.id,
            name: c.name,
            major: c.major,
            score: Math.round((c.totalScore / c.numReviews) * (100 / 24))
        }));

        candidates.sort((a, b) => b.score - a.score);
        candidates.forEach((c, index) => c.rank = index + 1);

        const totalReviewed = candidates.length;
        const avgScore = reviewCount > 0 ? (totalScoreSum / reviewCount * (100 / 24)).toFixed(1) : 0;
        const advancedCount = candidates.filter(c => c.score >= 80).length;

        res.json({
            stats: {
                applicants: totalApplicants || 0,
                reviewed: totalReviewed,
                advanced: advancedCount,
                avgScore: avgScore
            },
            candidates: candidates
        });

    } catch (err) {
        console.error("Scoreboard error:", err);
        res.status(500).json({ error: err.message });
    }
};
