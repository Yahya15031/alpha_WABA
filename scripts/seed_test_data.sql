-- Seed data for tenant isolation testing.
-- Run this in Supabase SQL Editor (as `postgres`, so BYPASSRLS applies and the
-- INSERTs succeed without setting `app.current_tenant_id`).
--
-- The distribution is deliberately lopsided (3 contacts for Acme, 2 for Globex)
-- so `scripts/check_isolation.py` gets clearly different counts when RLS works.

-- ---------------------------------------------------------------
-- 1. Wipe any prior seed with these fixed UUIDs (safe if empty).
-- ---------------------------------------------------------------
DELETE FROM contacts WHERE tenant_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);
DELETE FROM branches WHERE tenant_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);
DELETE FROM tenants WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);

-- ---------------------------------------------------------------
-- 2. Two tenants. Slugs are lowercase-hyphen only (regex-safe).
-- ---------------------------------------------------------------
INSERT INTO tenants (id, name, slug, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Acme Corp',   'acme-corp',   'active'),
    ('22222222-2222-2222-2222-222222222222', 'Globex Corp', 'globex-corp', 'active');

-- ---------------------------------------------------------------
-- 3. One branch per tenant (physical type).
-- ---------------------------------------------------------------
INSERT INTO branches (id, tenant_id, name, branch_type, status) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     'NY Office', 'physical', 'active'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '22222222-2222-2222-2222-222222222222',
     'London Office', 'physical', 'active');

-- ---------------------------------------------------------------
-- 4. Contacts. 3 for Acme, 2 for Globex.
-- ---------------------------------------------------------------
INSERT INTO contacts (tenant_id, branch_id, phone_e164, full_name, opt_in_status, source) VALUES
    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '+12025550101', 'Alice Acme',  'opted_in', 'manual'),
    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '+12025550102', 'Bob Acme',    'opted_in', 'manual'),
    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '+12025550103', 'Carol Acme',  'opted_in', 'manual'),
    ('22222222-2222-2222-2222-222222222222',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '+442071234567', 'Dave Globex', 'opted_in', 'manual'),
    ('22222222-2222-2222-2222-222222222222',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '+442071234568', 'Eve Globex',  'opted_in', 'manual');

-- ---------------------------------------------------------------
-- 5. Sanity check as postgres (sees everything, no RLS).
-- ---------------------------------------------------------------
SELECT t.name, COUNT(c.id) AS contact_count
FROM tenants t
LEFT JOIN contacts c ON c.tenant_id = t.id
WHERE t.id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
)
GROUP BY t.name
ORDER BY t.name;
-- Expected result:
--   Acme Corp    | 3
--   Globex Corp  | 2
