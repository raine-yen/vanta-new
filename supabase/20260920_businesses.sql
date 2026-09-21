-- businesses table for agent-managed business listings
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  website text,
  contact_email text,
  contact_phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: account can read/write their own businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_owner_select ON businesses;
CREATE POLICY businesses_owner_select ON businesses
  FOR SELECT
  USING (account_id = auth.uid());

DROP POLICY IF EXISTS businesses_owner_insert ON businesses;
CREATE POLICY businesses_owner_insert ON businesses
  FOR INSERT
  WITH CHECK (account_id = auth.uid());

DROP POLICY IF EXISTS businesses_owner_update ON businesses;
CREATE POLICY businesses_owner_update ON businesses
  FOR UPDATE
  USING (account_id = auth.uid())
  WITH CHECK (account_id = auth.uid());

DROP POLICY IF EXISTS businesses_owner_delete ON businesses;
CREATE POLICY businesses_owner_delete ON businesses
  FOR DELETE
  USING (account_id = auth.uid());

-- Index for account-scoped queries
CREATE INDEX IF NOT EXISTS businesses_account_id_idx ON businesses(account_id);
CREATE INDEX IF NOT EXISTS businesses_is_active_idx ON businesses(is_active) WHERE is_active = true;
