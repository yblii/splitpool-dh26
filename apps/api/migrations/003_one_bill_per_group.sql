-- Upgrade installs that still have the old "one active bill" partial unique index.
DROP INDEX IF EXISTS one_active_bill_per_group;
CREATE UNIQUE INDEX IF NOT EXISTS one_bill_per_group ON bills(group_id);
