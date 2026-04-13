require('dotenv').config();
const express = require('express');
const {createClient} = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

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
    return output.json(data);

});