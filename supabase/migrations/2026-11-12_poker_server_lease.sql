-- =============================================================================
-- Migration: One poker server at a time (SRS-NFR-026)
-- Author: JN (Jeremiah Nicols)
--
-- Updates an EXISTING database to match supabase/schema.sql. Run it once in
-- the Supabase SQL Editor. It drops nothing and is safe to run more than once.
--
-- The poker realtime server (server/pokerRealtimeServer.ts) holds every
-- table's state in memory, so two running at once would each keep their own
-- copy of each table. Before it handles anything, a server must hold the
-- lease below, and it renews it every few seconds; a second server waits
-- until the lease runs out (the first one stopped), and a server that loses
-- it stops at once (lib/pokerLease.ts).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS poker_server_lease (
    -- One row: the lease for all the poker tables.
    lease_key    VARCHAR(20)  PRIMARY KEY DEFAULT 'poker'
                 CHECK (lease_key = 'poker'),
    -- Which running server holds it (a random id it picks when it starts).
    holder       VARCHAR(80)  NOT NULL,
    -- Until when; the holder renews it well before then.
    expires_at   TIMESTAMPTZ  NOT NULL,
    -- When the holder last renewed it: a heartbeat for SRS-NFR-024.
    renewed_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE poker_server_lease ENABLE ROW LEVEL SECURITY;

-- Claims or renews the lease for p_holder for p_ttl_seconds: granted when
-- nobody holds it, it has run out, or p_holder already holds it. In one
-- statement under the row's lock, so two servers can't both get it.
-- Returns { held: true|false, holder, expires_at }.
CREATE OR REPLACE FUNCTION fn_poker_claim_lease(p_holder VARCHAR, p_ttl_seconds INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_row poker_server_lease%ROWTYPE;
BEGIN
    IF p_holder IS NULL OR length(p_holder) = 0 OR p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 THEN
        RAISE EXCEPTION 'A holder and a positive lease length are required';
    END IF;

    INSERT INTO poker_server_lease (lease_key, holder, expires_at, renewed_at)
    VALUES ('poker', p_holder, CURRENT_TIMESTAMP + make_interval(secs => p_ttl_seconds), CURRENT_TIMESTAMP)
    ON CONFLICT (lease_key) DO UPDATE
        SET holder     = EXCLUDED.holder,
            expires_at = EXCLUDED.expires_at,
            renewed_at = EXCLUDED.renewed_at
      WHERE poker_server_lease.holder = EXCLUDED.holder
         OR poker_server_lease.expires_at <= CURRENT_TIMESTAMP;

    SELECT * INTO v_row FROM poker_server_lease WHERE lease_key = 'poker';
    RETURN jsonb_build_object('held', v_row.holder = p_holder, 'holder', v_row.holder, 'expires_at', v_row.expires_at);
END;
$$;

-- Gives the lease up straight away (a server shutting down), so the next one
-- needn't wait for it to run out. Only the holder can.
CREATE OR REPLACE FUNCTION fn_poker_release_lease(p_holder VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE poker_server_lease SET expires_at = CURRENT_TIMESTAMP WHERE lease_key = 'poker' AND holder = p_holder;
    RETURN jsonb_build_object('released', FOUND);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_poker_claim_lease(VARCHAR, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_poker_release_lease(VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_claim_lease(VARCHAR, INTEGER) FROM anon, authenticated';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION fn_poker_release_lease(VARCHAR) FROM anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_claim_lease(VARCHAR, INTEGER) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION fn_poker_release_lease(VARCHAR) TO service_role';
    END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
