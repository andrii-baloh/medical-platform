BEGIN;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('account','appointment','payment','technical','other')),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','pending_user','pending_support','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal','high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_owner
  ON support_tickets(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue
  ON support_tickets(status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  sender_role text NOT NULL CHECK (sender_role IN ('user','admin')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON support_messages(ticket_id, created_at);

COMMIT;
