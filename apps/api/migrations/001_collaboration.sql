CREATE TABLE profiles (
  user_id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  host_id uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON group_members(user_id);

CREATE TABLE invites (
  token_hash text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id),
  target_user_id uuid REFERENCES profiles(user_id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bills (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id),
  state text NOT NULL DEFAULT 'EDITING' CHECK (state IN ('EDITING','REVIEW','COLLECTING','READY_TO_PAY','PAYMENT_PENDING','PAID','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  merchant text NOT NULL DEFAULT '' CHECK (length(merchant) <= 120),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents BETWEEN 0 AND 100000000),
  service_charge_cents integer NOT NULL DEFAULT 0 CHECK (service_charge_cents BETWEEN 0 AND 100000000),
  printed_total_cents integer CHECK (printed_total_cents BETWEEN 0 AND 100000000),
  tax_mode text NOT NULL DEFAULT 'proportional' CHECK (tax_mode IN ('equal','proportional')),
  service_charge_mode text NOT NULL DEFAULT 'proportional' CHECK (service_charge_mode IN ('equal','proportional')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_bill_per_group ON bills(group_id) WHERE state NOT IN ('PAID','CANCELLED');
CREATE TABLE bill_participants (
  bill_id uuid NOT NULL REFERENCES bills(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  tip_cents integer NOT NULL DEFAULT 0 CHECK (tip_cents BETWEEN 0 AND 100000000),
  PRIMARY KEY (bill_id, user_id)
);
CREATE TABLE items (
  id uuid PRIMARY KEY,
  bill_id uuid NOT NULL REFERENCES bills(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  net_line_total_cents integer NOT NULL CHECK (net_line_total_cents BETWEEN 0 AND 100000000),
  UNIQUE (bill_id, id)
);
CREATE TABLE claims (
  bill_id uuid NOT NULL,
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  numerator integer NOT NULL CHECK (numerator > 0),
  denominator integer NOT NULL CHECK (denominator BETWEEN 1 AND 1000000 AND numerator <= denominator),
  PRIMARY KEY (item_id, user_id),
  FOREIGN KEY (bill_id, item_id) REFERENCES items(bill_id, id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id, user_id) REFERENCES bill_participants(bill_id, user_id)
);
CREATE INDEX claims_bill ON claims(bill_id);
