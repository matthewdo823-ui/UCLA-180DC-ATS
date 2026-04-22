require('dotenv').config();
const express = require('express');
const {createClient} = require('@supabase/supabase-js');
const cors = require('cors');
const axios = require('axios');


const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173' }));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

//route handlers

//gets next resume row
app.get('/next-resume', async (input, output) => {
    console.log("HIT /next-resume");

    const {data,error} = await supabase
    .from('resumes')
    .select('*')
    .order('review_count', {ascending: true})
    .order('created_at', {ascending: true})
    .limit(1)
    .maybeSingle();

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) return output.status(500).json({error: error.message});
    if (!data) return output.status(404).json({error: "No resumes found"});

    const fileID = extractDriveFileID(data.file_url);
    
    if (!fileID) {
        return output.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    console.log("abouta pass file url: " + accessable_file_url);
    return output.json({
        ...data,
        "file_url": accessable_file_url
    }
    );
});

//saves review 
app.post('/reviews', async (input, output) => {
    const {resume_id, scores, notes} = input.body;

    //storing review
    const {error:reviewError} = await supabase 
        .from('resume_reviews')
        .insert({resume_id, scores, notes});
        
    if (reviewError) return output.status(500).json({error: reviewError.message});

    //increment
    const {error: countError} = await supabase.rpc(
        'increment_review_count', {resume_id_input: resume_id}
    );

    if (countError) return output.status(500).json({error: countError.message});
 
    return output.json({success: true});
});

//gets file link from resume 
app.get('/resume/:id/file', async(input,output) =>{
    const {data, error} = await supabase
    .from('resumes')
    .select('file_url')
    .eq('id', input.params.id)
    .single();

    if (error) return output.status(404).json({error: error.message});

    const fileID = extractDriveFileID(data.file_url);
    
    if (!fileID) {
        return output.status(400).json({ error: "Could not parse Google Drive ID" });
    }

    const accessable_file_url = toDownloadURL(fileID);

    return output.json({
        ...data,
        "file_url": accessable_file_url
    }
    );

});

//reverse proxy for file streaming (streams drive pdf to frontend)
app.get('/view/pdf', async(req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) return res.status(400).send("No URL provided");
    try{
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
    }
    catch (err){
        console.error("Proxy error: ", err.message);
        res.status(500).send("Error fetching pdf from drive");
    }
})



app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`)
});



//working thru drive urls
function extractDriveFileID(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Normalize
    const parsed = new URL(url);

    // 1. Check query params (?id=...)
    const idParam = parsed.searchParams.get('id');
    if (idParam) return idParam;

    // 2. Match /d/FILE_ID pattern (most common)
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    // 3. Match /file/d/FILE_ID (redundant but safe)
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    // 4. Fallback: last long token (rare edge case)
    const fallbackMatch = url.match(/[-\w]{25,}/);
    if (fallbackMatch) return fallbackMatch[0];

    return null;
  } catch (err) {
    console.error('Invalid URL:', url);
    return null;
  }
}



function toDownloadURL(fileID) {
  //return `https://drive.google.com/uc?export=download&id=${fileID}`;
//return `https://docs.google.com/viewer?url=https://drive.google.com/uc?id=${fileID}&embedded=true`;;
    //return `https://drive.google.com/file/d/${fileID}/preview`;
    return `https://drive.google.com/uc?export=download&id=${fileID}`
}


