ALTER TABLE ai_usage_events
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'GEMINI';

CREATE TABLE IF NOT EXISTS writing_prompt_templates (
  id TEXT PRIMARY KEY,
  exam_category TEXT NOT NULL,
  template_type TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt_base TEXT NOT NULL,
  guidance TEXT NOT NULL,
  default_word_count_min INTEGER NOT NULL,
  default_word_count_max INTEGER NOT NULL,
  sample_topic TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_writing_templates_exam_active
  ON writing_prompt_templates(exam_category, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS writing_assignments (
  id TEXT PRIMARY KEY,
  organization_name TEXT NOT NULL,
  instructor_user_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  template_id TEXT,
  exam_category TEXT NOT NULL,
  template_type TEXT NOT NULL,
  prompt_title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  guidance TEXT NOT NULL,
  word_count_min INTEGER NOT NULL,
  word_count_max INTEGER NOT NULL,
  submission_code TEXT NOT NULL UNIQUE,
  prompt_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL,
  issued_at INTEGER,
  last_submitted_at INTEGER,
  last_returned_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (instructor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES writing_prompt_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_writing_assignments_student_status
  ON writing_assignments(student_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_writing_assignments_org_status
  ON writing_assignments(organization_name, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_writing_assignments_instructor_status
  ON writing_assignments(instructor_user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS writing_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  submission_source TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  transcript TEXT,
  transcript_confidence REAL NOT NULL DEFAULT 0,
  ocr_provider TEXT,
  selected_evaluation_id TEXT,
  processing_state TEXT NOT NULL DEFAULT 'UPLOADED',
  created_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES writing_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (assignment_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_writing_submissions_assignment_submitted
  ON writing_submissions(assignment_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS writing_submission_assets (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  submission_id TEXT,
  attempt_no INTEGER NOT NULL,
  asset_order INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  upload_token TEXT UNIQUE,
  uploaded_at INTEGER,
  finalized_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES writing_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES writing_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_writing_assets_assignment_attempt
  ON writing_submission_assets(assignment_id, attempt_no, asset_order ASC);

CREATE INDEX IF NOT EXISTS idx_writing_assets_submission
  ON writing_submission_assets(submission_id, asset_order ASC);

CREATE TABLE IF NOT EXISTS writing_ai_evaluations (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  rubric_json TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  improvement_points_json TEXT NOT NULL,
  sentence_corrections_json TEXT NOT NULL,
  corrected_draft TEXT NOT NULL,
  model_answer TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  transcript_alignment REAL NOT NULL DEFAULT 0,
  rubric_consistency REAL NOT NULL DEFAULT 0,
  structure_score REAL NOT NULL DEFAULT 0,
  selection_score REAL NOT NULL DEFAULT 0,
  cost_milli_yen INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_snapshot TEXT NOT NULL,
  raw_payload TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES writing_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_writing_evaluations_submission_provider
  ON writing_ai_evaluations(submission_id, provider, created_at DESC);

CREATE TABLE IF NOT EXISTS writing_teacher_reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  reviewer_user_id TEXT NOT NULL,
  selected_evaluation_id TEXT NOT NULL,
  public_comment TEXT NOT NULL,
  private_memo TEXT,
  review_decision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  released_at INTEGER,
  FOREIGN KEY (submission_id) REFERENCES writing_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_evaluation_id) REFERENCES writing_ai_evaluations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_writing_reviews_reviewer_created
  ON writing_teacher_reviews(reviewer_user_id, created_at DESC);

INSERT OR IGNORE INTO writing_prompt_templates (
  id,
  exam_category,
  template_type,
  title,
  prompt_base,
  guidance,
  default_word_count_min,
  default_word_count_max,
  sample_topic,
  tags,
  created_at,
  updated_at
) VALUES
  (
    'tpl-eiken-opinion-01',
    'EIKEN',
    'OPINION',
    '英検 意見提示',
    'State whether you agree or disagree with the statement and support your opinion with two reasons related to school life or society.',
    '導入で立場を明示し、理由を2つに絞って具体例を入れる。',
    80,
    100,
    'Should students use tablets in every class?',
    '["eiken","opinion","school"]',
    1741700000000,
    1741700000000
  ),
  (
    'tpl-eiken-email-01',
    'EIKEN',
    'EMAIL',
    '英検 Eメール返信',
    'Reply to a short email from a friend or teacher. Answer all questions naturally and add one related question at the end.',
    '宛名・本文・結びを意識し、問いへの回答漏れをなくす。',
    50,
    70,
    'A friend asks about your study routine before a test.',
    '["eiken","email","communication"]',
    1741700000000,
    1741700000000
  ),
  (
    'tpl-univ-opinion-01',
    'UNIV',
    'DISCUSSION',
    '大学入試 意見論述',
    'Write an essay presenting your position on a social issue, develop your reasoning logically, and mention at least one counterpoint or limitation.',
    '序論・本論・結論を分け、論理のつながりが見える接続表現を使う。',
    120,
    160,
    'Should part-time jobs be encouraged for high school students?',
    '["univ","discussion","society"]',
    1741700000000,
    1741700000000
  ),
  (
    'tpl-univ-summary-01',
    'UNIV',
    'SUMMARY',
    '大学入試 要約英作文',
    'Read a short Japanese prompt and summarize the key idea in English before adding your own brief opinion.',
    '要点を圧縮し、主観パートを分けて書く。',
    90,
    120,
    'Explain one recent change in local communities and your view on it.',
    '["univ","summary","analysis"]',
    1741700000000,
    1741700000000
  );
