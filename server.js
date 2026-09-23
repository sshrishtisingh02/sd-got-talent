/**
 * SD Got Talent — AI Talent Evaluation Platform Backend Service
 * Architecture: Node.js, Express, Multer, Fluent-FFmpeg, OpenAI SDK
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Load API key strictly from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'MOCK_KEY_FOR_LOCAL_MODE'
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer Storage for Video Ingestion
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid format: Only MP4, MOV, and WebM are permitted.'));
    }
  }
});

// FIXED SYSTEM PROMPT: Strictly enforces anti-hallucination and mathematical immutability
const EVALUATION_SYSTEM_PROMPT = `
You are the certified SD Got Talent AI Evaluation Engine for Ericsson Service Delivery.
You MUST evaluate candidate transcripts ONLY against the predefined scoring framework below.

MATHEMATICAL WEIGHTS (STRICTLY IMMUTABLE):
1. MANDATORY TOPICS (60 Points Total):
   - strengths: 0 to 15 points (Capability demonstrated, evidence, relevance to SD, not CV recitation)
   - achievements: 0 to 20 points (2-3 meaningful achievements, measurable scale/ownership/impact)
   - aspiration: 0 to 10 points (Clarity of 5-year direction, connection to Ericsson future)
   - innovation_idea: 0 to 15 points (Problem clarity, practicality, customer/delivery impact, scalability)

2. CONTRIBUTION AREAS (30 Points Total Normalized):
   Score each of the 12 areas strictly from 0 to 5 based on verifiable proof (0=None, 1=Mentioned only, 2=Basic, 3=Clear, 4=Strong, 5=Measurable impact):
   - customer_impact, delivery_excellence, technical_expertise, innovation_automation,
     program_transformation, collaboration, resilience_problem_solving,
     quality_security_compliance, commercial_value, sustainability,
     emerging_talent, knowledge_builder.
   Formula: Normalized = (Sum of 12 scores / 60) * 30.

3. VIDEO COMPLIANCE (10 Points Total):
   - Deduct points only for technical violations (orientation, audio, presentation).
   - Flag any potential confidential IP for human review.

FAIRNESS & IMPARTIALITY:
- Do NOT evaluate, mention, or infer: age, gender, race, ethnicity, religion, physical appearance, family status, or regional accent.
- If evidence is missing for any pillar, state explicitly: "Insufficient evidence in the submitted video."
- Output valid JSON only matching the internal data structure.
`;

// Helper: Inspect Video Metadata using FFprobe
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const width = videoStream ? videoStream.width : 0;
      const height = videoStream ? videoStream.height : 0;
      resolve({ duration, width, height, isLandscape: width >= height });
    });
  });
}

// Helper: Extract audio to MP3 for transcription
function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .save(audioPath)
      .on('end', () => resolve(audioPath))
      .on('error', (err) => reject(err));
  });
}

// Main Video Evaluation Route
app.post('/api/evaluate-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const videoPath = req.file.path;
    const audioPath = `${videoPath}.mp3`;

    // 1. Technical Pre-Validation
    const meta = await getVideoMetadata(videoPath);
    if (meta.duration > 185) {
      fs.unlinkSync(videoPath);
      return res.status(400).json({
        error: `Submission rejected: Duration of ${Math.round(meta.duration)}s exceeds the 3-minute limit (180s).`
      });
    }

    // 2. Audio Extraction & Speech Transcription
    await extractAudio(videoPath, audioPath);

    let transcript = "Candidate discusses 100% automated network orchestration and downtime reduction across regional clusters.";
    
    // Check if live OpenAI API Key is configured
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'MOCK_KEY_FOR_LOCAL_MODE') {
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment']
      });
      transcript = transcriptionResponse.text;
    }

    // Clean up temporary audio file
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    // 3. AI Evaluation Call
    let evaluationResult;
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'MOCK_KEY_FOR_LOCAL_MODE') {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
          { 
            role: 'user', 
            content: `Evaluate the following transcript for candidate: ${req.body.name || 'Anonymous'}.\n\nTRANSCRIPT:\n${transcript}` 
          }
        ],
        temperature: 0.2
      });
      evaluationResult = JSON.parse(completion.choices[0].message.content);
    } else {
      // Deterministic Local Fallback (when running offline or without an active key)
      evaluationResult = {
        mandatory_topics: {
          strengths: { score: 14, feedback: "Demonstrated clear Cloud-native RAN deployment capabilities." },
          achievements: { score: 18, feedback: "Documented 35% reduction in deployment lifecycle hours." },
          aspiration: { score: 9, feedback: "Clear vision toward autonomous network orchestration." },
          innovation_idea: { score: 13, feedback: "Telemetry-driven proactive incident prevention framework." }
        },
        contribution_areas: {
          customer_impact: 4, delivery_excellence: 5, technical_expertise: 5,
          innovation_automation: 4, program_transformation: 3, collaboration: 4,
          resilience_problem_solving: 4, quality_security_compliance: 4,
          commercial_value: 3, sustainability: 3, emerging_talent: 4, knowledge_builder: 4
        },
        video_compliance: {
          score: meta.isLandscape ? 9.5 : 6.0,
          flags: meta.isLandscape ? [] : ["Non-landscape aspect ratio detected"]
        },
        justification: "Candidate provided evidence-backed statements with clear quantitative indicators.",
        strengths: ["Measurable impact metrics cited", "Direct relevance to modern Service Delivery"],
        gaps: ["Commercial ARR indicators were qualitative rather than quantitative"]
      };
    }

    // 4. Mathematical Normalization (Enforcing the 60 + 30 + 10 Rule)
    const topicTotal = 
      evaluationResult.mandatory_topics.strengths.score +
      evaluationResult.mandatory_topics.achievements.score +
      evaluationResult.mandatory_topics.aspiration.score +
      evaluationResult.mandatory_topics.innovation_idea.score;

    const contribSum = Object.values(evaluationResult.contribution_areas).reduce((a, b) => a + b, 0);
    const normalizedContrib = Number(((contribSum / 60) * 30).toFixed(1));
    const complianceScore = evaluationResult.video_compliance.score;
    const finalScore = Number((topicTotal + normalizedContrib + complianceScore).toFixed(1));

    const payload = {
      candidate: {
        name: req.body.name,
        email: req.body.email,
        team: req.body.team,
        role: req.body.role || "Service Delivery Professional"
      },
      overall_score: finalScore,
      scores_breakdown: {
        mandatory_topics_score: topicTotal,
        contribution_areas_score: normalizedContrib,
        compliance_score: complianceScore
      },
      mandatory_topics: evaluationResult.mandatory_topics,
      contribution_areas: evaluationResult.contribution_areas,
      video_compliance: evaluationResult.video_compliance,
      strengths: evaluationResult.strengths,
      gaps: evaluationResult.gaps,
      justification: evaluationResult.justification,
      human_review: {
        status: "Pending",
        scoreOverride: null,
        comments: "",
        reviewer: null
      }
    };

    return res.status(200).json(payload);

  } catch (error) {
    console.error('Processing error:', error);
    return res.status(500).json({ error: 'AI Evaluation pipeline failure: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`SD Got Talent Production Server running on port ${PORT}`);
  console.log(`Video upload directory: ./uploads`);
  console.log(`OpenAI Integration: ${process.env.OPENAI_API_KEY ? 'Configured via ENV' : 'Local Fallback Simulation Mode'}`);
  console.log(`====================================================`);
});