-- M-02b, D-58: a fourth role above owner.
-- Postgres cannot use a new enum value in the transaction that adds it, so this
-- migration adds the value and nothing else; 0004 uses it.
alter type app_role add value if not exists 'admin';
