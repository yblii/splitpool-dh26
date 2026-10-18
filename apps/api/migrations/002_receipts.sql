CREATE TABLE receipts (
  bill_id uuid PRIMARY KEY REFERENCES bills(id),
  image_key text NOT NULL CHECK (length(trim(image_key)) BETWEEN 1 AND 500),
  parsing_status text NOT NULL CHECK (parsing_status IN ('extracted', 'fallback', 'verified')),
  extracted_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
