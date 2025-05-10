-- Database setup script for Neon UI
-- Run this to initialize the database schema

-- Drop tables if they exist
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS databases;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  roles TEXT[] DEFAULT ARRAY['user'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create auth_tokens table
CREATE TABLE auth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create databases table
CREATE TABLE databases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  source VARCHAR(50) DEFAULT 'local',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add sample users
INSERT INTO users (first_name, last_name, email, password_hash, company_name, roles)
VALUES 
  ('Admin', 'User', 'admin@neondb.io', '$2b$10$dJoZNDYJo5k7a/gWgLE1S.vxD2tA3G2mJM7R42ISRmTfF4YYvpZSm', 'Neon', ARRAY['admin', 'developer']),
  ('Demo', 'User', 'demo@neondb.io', '$2b$10$aSyA.5GZ9Tx8tl66rj1i/uP./5..eYrGSIPHYvUNlJgC8UVN46Tt2', 'Demo Corp', ARRAY['user']);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_databases_user_id ON databases(user_id);
CREATE INDEX idx_databases_name ON databases(name);

-- Grant permissions
ALTER TABLE users OWNER TO current_user;
ALTER TABLE auth_tokens OWNER TO current_user;
ALTER TABLE databases OWNER TO current_user; 