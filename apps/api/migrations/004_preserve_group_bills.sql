-- Groups keep closed bills as history. Only one open bill may exist at a time.
DROP INDEX IF EXISTS one_bill_per_group;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_bill_per_group
  ON bills(group_id)
  WHERE state NOT IN ('PAID', 'CANCELLED');
