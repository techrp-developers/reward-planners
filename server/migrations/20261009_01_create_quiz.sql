CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(500) NOT NULL,
  options JSON NOT NULL,
  correct_index TINYINT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  seed_key VARCHAR(80) NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quiz_players (
  user_id INT NOT NULL PRIMARY KEY,
  state JSON NULL,
  best_score INT NULL,
  total_games INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY quiz_ranking (best_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO quiz_questions (seed_key, question, options, correct_index) VALUES
('india-capital', 'What is the capital city of India?', JSON_ARRAY('Mumbai', 'New Delhi', 'Kerala', 'Maharashtra'), 1),
('red-planet', 'Which planet is known as the Red Planet?', JSON_ARRAY('Venus', 'Jupiter', 'Mars', 'Saturn'), 2),
('triangle', 'How many sides does a triangle have?', JSON_ARRAY('Three', 'Four', 'Five', 'Six'), 0),
('largest-ocean', 'Which is the largest ocean in the world?', JSON_ARRAY('Atlantic', 'Indian', 'Arctic', 'Pacific'), 3),
('taj-mahal', 'Where is the Taj Mahal situated?', JSON_ARRAY('Delhi', 'Mumbai', 'Agra', 'Gujarat'), 2),
('week-days', 'How many days are there in a week?', JSON_ARRAY('Five', 'Six', 'Seven', 'Eight'), 2),
('water-freeze', 'At what temperature does water freeze in Celsius?', JSON_ARRAY('0 degrees', '10 degrees', '50 degrees', '100 degrees'), 0),
('earth-satellite', 'What is the natural satellite of Earth?', JSON_ARRAY('Mars', 'The Sun', 'Venus', 'The Moon'), 3);
