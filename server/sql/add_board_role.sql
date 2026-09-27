-- Board members have normal member access plus permission to grade FRQs.
-- The application validates this role too, but PostgreSQL must accept the enum
-- value before an admin can assign it in User Management.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'board';
