require('dotenv').config();
const express = require('express');
const {createClient} = require('@supabase/supabase-js');
const cors = require('cors');


const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173' }));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

//route handlers

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`)
});

//gets next resume row
app.get('/next-resume', async (input, output) => {
    const {data,error} = await supabase
    .from('resumes')
    .select('*')
    .order('review_count', {ascending: true})
    .order('created_at', {ascending: true})
    .limit(1)
    .single();

    if (error) return output.status(500).json({error: error.message});
    if (!data) return output.status(404).json({error: "No resumes found"});

    return output.json(data);
});

//saves review 
app.post('/reviews', async (input, output) => {
    const {resume_id, scores, notes} = input.body;

    //storing review
    const {error:reviewError} = await supabase 
        .from('reviews')
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

    let accessable_file_url = toDownloadURL(extractDriveFileId(data.file_url));

    return output.json({
        ...data,
        "file_url": accessable_file_url
    }
    );

});






//working thru drive urls
function extractDriveFileId(url) {
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

function toDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
