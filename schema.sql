-- SD GOT TALENT DATABASE SCHEMA (PostgreSQL / SQLite Compatible)

CREATE TABLE IF NOT EXISTS candidates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    team VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
    id VARCHAR(64) PRIMARY KEY,
    candidate_id VARCHAR(64) REFERENCES candidates(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    duration_seconds INT NOT NULL,
    resolution VARCHAR(32),
    aspect_ratio VARCHAR(16),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcripts (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) REFERENCES videos(id) ON DELETE CASCADE,
    full_text TEXT NOT NULL,
    segments_json JSON,
    language VARCHAR(16) DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
    id VARCHAR(64) PRIMARY KEY,
    candidate_id VARCHAR(64) REFERENCES candidates(id) ON DELETE CASCADE,
    overall_score NUMERIC(4, 1) NOT NULL,
    mandatory_topics_score NUMERIC(4, 1) NOT NULL,
    contribution_score NUMERIC(4, 1) NOT NULL,
    compliance_score NUMERIC(4, 1) NOT NULL,
    topic_scores_json JSON NOT NULL,
    contribution_scores_json JSON NOT NULL,
    evidence_justification TEXT NOT NULL,
    strengths_json JSON NOT NULL,
    gaps_json JSON NOT NULL,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS human_reviews (
    id VARCHAR(64) PRIMARY KEY,
    candidate_id VARCHAR(64) REFERENCES candidates(id) ON DELETE CASCADE,
    reviewer_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) DEFAULT 'Pending', -- Pending, Approved, Waitlisted, Declined
    score_override NUMERIC(4, 1) DEFAULT NULL,
    panel_comments TEXT,
    flagged_for_compliance BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);