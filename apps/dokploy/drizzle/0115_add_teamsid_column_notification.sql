ALTER TABLE notification
  ADD COLUMN teamsId text;

ALTER TABLE notification
  ADD CONSTRAINT notification_teamsid_fkey
  FOREIGN KEY (teamsId) REFERENCES teams(teamsId) ON DELETE CASCADE;