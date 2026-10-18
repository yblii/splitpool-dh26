-- Upgrade installs that still have the old "one active bill" partial unique index.
-- Groups may already have multiple bills (one open + closed history); collapse to one.
DROP INDEX IF EXISTS one_active_bill_per_group;

CREATE TEMP TABLE discarded_bills ON COMMIT DROP AS
SELECT id
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY group_id
      ORDER BY
        CASE WHEN state NOT IN ('PAID', 'CANCELLED') THEN 0 ELSE 1 END,
        created_at DESC,
        id DESC
    ) AS rn
  FROM bills
) ranked
WHERE rn > 1;

DELETE FROM claims WHERE bill_id IN (SELECT id FROM discarded_bills);
DELETE FROM items WHERE bill_id IN (SELECT id FROM discarded_bills);
DELETE FROM bill_participants WHERE bill_id IN (SELECT id FROM discarded_bills);
DELETE FROM receipts WHERE bill_id IN (SELECT id FROM discarded_bills);
DELETE FROM bills WHERE id IN (SELECT id FROM discarded_bills);

CREATE UNIQUE INDEX IF NOT EXISTS one_bill_per_group ON bills(group_id);
