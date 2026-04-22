import { useState, useEffect } from 'react'

const METRICS = ['experience', 'leadership', 'social impact'];
const API = 'http://localhost:3000';

//left component
function ResumeViewer({resume, loading}){
  if(!resume){return <div> no mo resumes </div>};  
    return (
          <iframe
            src={`${resume.file_url}#toolbar=0&navpanes=0`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Resume"
          />
    );
  }

//right component (balls)

function Sidebar({resume, scores, onScore, notes, onNotes, onSubmit}) {
    const total = Object.values(scores).reduce((a,b) => a+b, 0);
    const maxTotal = METRICS.length * 5;

    //header
    return (
      <div style = {{display: 'flex', flexDirection: 'column', borderLeft: '1px solid #ee'}}>
        
        <div style={{padding: 16, borderBottom: '1px solid #eee'}}>
          <strong>{resume?.name ?? 'Loading...'}</strong>
        </div>
        
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {METRICS.map(metric =>(
          <ScoreRow 
            metric={metric}
            value={scores[metric]}
            onScore={onScore}
          />
        ))}
      </div>




        <div style={{ margin: '0 16px', padding: 12, background: '#f5f5f5', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#666' }}>Aggregate score</span>
        <span style={{ fontWeight: 500 }}>{total} / {METRICS.length * 5}</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value)}
          placeholder="Notes..."
          style={{ width: '100%', height: 80, padding: 8, resize: 'none', borderRadius: 8, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}
        />
        <button
          onClick={onSubmit}
          style={{ width: '100%', height: 36, background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          Submit and load next
        </button>
         </div></div>

    );
}

//child of sidebar

function ScoreRow({metric, value, onScore}){
      return (
        //metric
        <div>
          <div style = {{fontSize: 13, marginBottom: 8, textTransform: 'Capitalize'}}>
            {metric}
          </div>

        
        <div style={{display: 'flex', gap: 6}}>
          {[1,2,3,4,5].map((num) => (
            <button
              key={num}
              onClick={() => onScore(metric,num)}
              style={{
                flex: 1, height: 32,
                background:value===num ? '#E6F1FB' : 'transparent',
                border: `0.5px solid ${value === num ? '#185FA5' : '#ccc'}`,
                borderRadius: 8, cursor: 'pointer',
                fontWeight: value === num ? 500 : 400,
                color: value === num ? '#0C447C' : '#666'
              }}
            >
              {num}
            </button>
          ))}

        </div>
        </div>
      )
  }


export default function App() {
  //loading variables that can be changes
  const [resume, setResume] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  //runs fetchnext once on render
  useEffect(() => {fetchNext();}, []);

  async function fetchNext(){

    try{
      //set loading true
      setLoading(true);
      //set response to fetch next resume hyper
      const res = await fetch(`${API}/next-resume`);

  if (!res.ok) {
      console.error("Server error:", res.status);
      setResume(null); // <-- don't set the error object as resume
      return;
    }

      //make data json of response
      const data = await res.json();
      //set every var according to data and change loading 0
    setResume(data);
    setScores({});
    setNotes('');}
    
    catch (err){
      console.error("Fetch failed: ", err);
    }
    finally{
setLoading(false);}
  }

  async function handleSubmit(){
    await fetch (`${API}/reviews`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resume_id: resume.id, scores, notes})
    })
    //post data to reviews
      

    
    fetchNext();
    //fetch next
  }

  //rendering ui

  return (
    <div style = {{display: 'grid', gridTemplateColumns: '1fr 320px', height: '100vh'}}>

      {loading ? (
      <div style={{ padding: 20 }}>Loading PDF...</div>
    ) : resume?.file_url ? (
      <ResumeViewer resume={resume} loading={loading}/>
    ) : (
      <div style={{ padding: 20 }}>No resume found.</div>
    )}


    {!loading && resume ? (<Sidebar
      resume={resume}
      scores={scores}
      onScore={(metric, val) => setScores(s => ({...s, [metric]: val}))}
      notes={notes}
      onNotes={setNotes}
      onSubmit={handleSubmit}
    ></Sidebar>
    ) : (
    <div style={{ width: 320, padding: 20 }}>Loading details...</div>)}
  </div>
  );

}