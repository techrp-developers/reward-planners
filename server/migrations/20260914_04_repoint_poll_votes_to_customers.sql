ALTER TABLE company_poll_votes
  DROP FOREIGN KEY fk_company_poll_votes_user;

ALTER TABLE company_poll_votes
  ADD CONSTRAINT fk_company_poll_votes_user
  FOREIGN KEY (user_id) REFERENCES customer(user_id) ON DELETE CASCADE;
