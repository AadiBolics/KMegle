CREATE TABLE IF NOT EXISTS users (
 id varchar(128) PRIMARY KEY, email_hash text UNIQUE, is_banned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), last_login timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_blocks (
 blocker_id varchar(128) NOT NULL, blocked_id varchar(128) NOT NULL,
 block_ref uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (blocker_id,blocked_id)
);
ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS block_ref uuid DEFAULT gen_random_uuid();
ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_reference ON user_blocks(block_ref);
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_pair ON user_blocks(blocker_id,blocked_id);
CREATE TABLE IF NOT EXISTS user_violations (
 id serial PRIMARY KEY, uid varchar(128) NOT NULL, violation_type varchar(64) NOT NULL,
 timestamp timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_violations_uid_time ON user_violations(uid,timestamp DESC);
CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id varchar(128) NOT NULL,reported_id varchar(128) NOT NULL,
 reason text,status varchar(64) DEFAULT 'pending',created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports(reported_id);
CREATE TABLE IF NOT EXISTS user_acceptances (
 uid varchar(128) PRIMARY KEY, version text NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_actions (
 id bigserial PRIMARY KEY, admin_uid varchar(128) NOT NULL,action text NOT NULL,
 subject text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
