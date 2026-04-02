-- TalentFlow LMS — Supabase PostgreSQL Schema
-- Paste this into the Supabase SQL Editor and run it.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL UNIQUE,
  password               TEXT NOT NULL,
  role                   TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'instructor', 'admin')),
  refresh_token          TEXT,
  password_reset_token   TEXT,
  password_reset_expires TIMESTAMPTZ,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  last_login             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  avatar       TEXT,
  bio          TEXT DEFAULT '',
  skills       TEXT[] DEFAULT '{}',
  social_links JSONB DEFAULT '{"website":"","linkedin":"","twitter":"","github":""}',
  phone        TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  job_title    TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  instructor_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  thumbnail      TEXT,
  category       TEXT NOT NULL,
  level          TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  price          NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  tags           TEXT[] DEFAULT '{}',
  total_duration INT DEFAULT 0,
  language       TEXT DEFAULT 'English',
  requirements   TEXT[] DEFAULT '{}',
  objectives     TEXT[] DEFAULT '{}',
  average_rating NUMERIC(3, 1) DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON courses (instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_category      ON courses (category);
CREATE INDEX IF NOT EXISTS idx_courses_level         ON courses (level);
CREATE INDEX IF NOT EXISTS idx_courses_is_published  ON courses (is_published);
CREATE INDEX IF NOT EXISTS idx_courses_created_at    ON courses (created_at);

-- ============================================================
-- ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id   ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments (course_id);

-- ============================================================
-- LESSONS
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  video_url   TEXT,
  duration    NUMERIC(10, 2) DEFAULT 0,
  order_index INT NOT NULL,
  resources   JSONB DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  type        TEXT DEFAULT 'video' CHECK (type IN ('video', 'text', 'quiz', 'assignment')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_id   ON lessons (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_order_index ON lessons (course_id, order_index);

-- ============================================================
-- LESSON PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lesson_id        UUID NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at     TIMESTAMPTZ,
  watch_time       INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_course   ON lesson_progress (user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson   ON lesson_progress (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_completed     ON lesson_progress (user_id, course_id, completed);

-- ============================================================
-- CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS certificates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  certificate_id TEXT NOT NULL UNIQUE,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  template_data  JSONB DEFAULT '{}',
  is_valid       BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at     TIMESTAMPTZ,
  revoke_reason  TEXT,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user_id        ON certificates (user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id      ON certificates (course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_id ON certificates (certificate_id);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  course_id   UUID REFERENCES courses (id) ON DELETE SET NULL,
  created_by  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  max_members INT NOT NULL DEFAULT 10,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams (created_by);
CREATE INDEX IF NOT EXISTS idx_teams_course_id  ON teams (course_id);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members (user_id);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  due_date     TIMESTAMPTZ NOT NULL,
  max_score    INT NOT NULL DEFAULT 100,
  attachments  JSONB DEFAULT '[]',
  created_by   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date  ON assignments (due_date);

-- ============================================================
-- SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content       TEXT DEFAULT '',
  attachments   JSONB DEFAULT '[]',
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  grade         NUMERIC(5, 2),
  feedback      TEXT,
  graded_by     UUID REFERENCES users (id) ON DELETE SET NULL,
  graded_at     TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded', 'late')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id       ON submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status        ON submissions (user_id, status);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
               'course_enrolled', 'course_completed', 'assignment_graded',
               'assignment_submitted', 'certificate_issued', 'team_invite',
               'team_update', 'lesson_published', 'course_published', 'system', 'other'
             )),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  data       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (user_id, is_read, created_at DESC);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id UUID,
  metadata    JSONB DEFAULT '{}',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource   ON audit_logs (resource, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- ============================================================
-- DAILY STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_stats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                DATE NOT NULL UNIQUE,
  total_users         INT NOT NULL DEFAULT 0,
  active_users        INT NOT NULL DEFAULT 0,
  courses_created     INT NOT NULL DEFAULT 0,
  enrollments         INT NOT NULL DEFAULT 0,
  completions         INT NOT NULL DEFAULT 0,
  certificates_issued INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats (date DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Disable RLS on all tables so the service role key has full
-- access. Enable and configure policies if you want to use
-- the anon/authenticated Supabase Auth keys instead.
-- ============================================================
ALTER TABLE users           DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses         DISABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments     DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons         DISABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE certificates    DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams           DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members    DISABLE ROW LEVEL SECURITY;
ALTER TABLE assignments     DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats     DISABLE ROW LEVEL SECURITY;
