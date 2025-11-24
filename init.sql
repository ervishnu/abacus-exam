CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100), -- Added Full Name field
    allowed_level TEXT NOT NULL, 
    role VARCHAR(10) DEFAULT 'student', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    level_id VARCHAR(20),
    score INTEGER,
    total_questions INTEGER,
    percentage INTEGER,
    time_taken_seconds INTEGER,
    questions_attempted INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEED DEFAULT ADMIN USER
INSERT INTO users (username, password, full_name, allowed_level, role) 
VALUES ('admin', 'admin', 'Administrator', 'all', 'admin')
ON CONFLICT (username) DO NOTHING;
