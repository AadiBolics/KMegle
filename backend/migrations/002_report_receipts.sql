ALTER TABLE reports ADD COLUMN IF NOT EXISTS request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS reports_request_receipt ON reports(reporter_id,request_id);
