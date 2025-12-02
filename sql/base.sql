-- Base migration: Create migrations tracking and generic_locks table

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generic_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lockname VARCHAR(255) NOT NULL UNIQUE,
    created TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_generic_locks_lockname ON generic_locks(lockname);

-- Insert initial locks
INSERT INTO generic_locks (lockname) VALUES ('testlock');
INSERT INTO generic_locks (lockname) VALUES ('create_employee_lock');
