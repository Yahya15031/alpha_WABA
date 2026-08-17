-- ============================================================
-- SANDBOX SEED — Real Meta WABA + verified recipients
-- Run in Supabase SQL Editor as `postgres`.
-- Prerequisite: SANDBOX_SETUP.md Parts 1 & 2 completed.
-- ============================================================
-- Idempotent: safe to re-run. Uses ON CONFLICT DO NOTHING where relevant.

-- ---------------------------------------------------------------
-- 1. Register the Meta sandbox WABA under Acme Corp
-- ---------------------------------------------------------------
INSERT INTO wabas (
    id, tenant_id, meta_waba_id, business_name, waba_type, status
) VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',   -- Acme Corp
    '1087808273918839',                        -- Meta's real WABA ID
    'Alpha Portal Sandbox',
    'sandbox_test',
    'active'
)
ON CONFLICT (meta_waba_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Register the sandbox phone number under that WABA
-- ---------------------------------------------------------------
INSERT INTO phone_numbers (
    id, tenant_id, waba_id, meta_phone_number_id, display_phone_number,
    is_test_number, status
) VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '11111111-1111-1111-1111-111111111111',   -- Acme Corp
    '1049671297638323',   -- our WABA id
    '1220657667800081',                        -- Meta's phone number ID
    '+1 555 136 3733',
    TRUE,
    'active'
)
ON CONFLICT (meta_phone_number_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Register the custom template
-- Run this AFTER Meta shows the template status as "Approved"
-- (usually 1-5 min after creating it in WhatsApp Manager)
-- ---------------------------------------------------------------
INSERT INTO templates (
    id, tenant_id, waba_id, name, language_code, category, status,
    body_text, variable_definitions
) VALUES (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '11111111-1111-1111-1111-111111111111',   -- Acme Corp
    '1049671297638323',   -- our WABA id
    'alpha_test_broadcast_v1',
    'en_US',
    'utility',
    'approved',
    'Hello {{1}}! You''re receiving this test broadcast from *{{2}}* at {{3}}. This confirms end-to-end delivery. Reply STOP to opt out.',
    '[
      {"index": 1, "description": "Recipient full name", "example": "Yahya"},
      {"index": 2, "description": "Tenant name (rendered bold)", "example": "Acme Corp"},
      {"index": 3, "description": "Send timestamp", "example": "2026-07-18 14:32 UTC"}
    ]'::jsonb
)
ON CONFLICT (tenant_id, waba_id, name, language_code) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Real recipient phones as contacts
--
-- REPLACE THE PLACEHOLDER NUMBERS BELOW with the 5 phones you
-- verified in WhatsApp Manager (SANDBOX_SETUP.md Step 2.1).
--
-- Layout:
--   - Numbers 1, 2, 3 → Acme contacts
--   - Number 3 (same phone, second row!) → Globex contact — deliberate overlap
--   - Numbers 4, 5 → Globex-only contacts
--
-- The overlap on number 3 is intentional — proves that when both tenants
-- have the same real phone number in their contact lists, RLS keeps them
-- in separate lanes. Same person, two separate business relationships.
-- ---------------------------------------------------------------

INSERT INTO contacts (
    tenant_id, branch_id, phone_e164, full_name, opt_in_status, source
) VALUES
    -- ===== ACME CORP (3 real recipients) =====
    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  -- NY Office branch
     '+92300XXXXXXX',              -- REPLACE: verified number #1
     'Real Recipient 1 (Acme)', 'opted_in', 'manual'),

    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '+92301XXXXXXX',              -- REPLACE: verified number #2
     'Real Recipient 2 (Acme)', 'opted_in', 'manual'),

    ('11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '+92302XXXXXXX',              -- REPLACE: verified number #3 (also appears in Globex below)
     'Real Recipient 3 (Acme)', 'opted_in', 'manual'),

    -- ===== GLOBEX CORP (2 unique + 1 overlap with Acme) =====
    ('22222222-2222-2222-2222-222222222222',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',  -- London Office branch
     '+92302XXXXXXX',              -- REPLACE: SAME as verified number #3 above
     'Real Recipient 3 (Globex)', 'opted_in', 'manual'),

    ('22222222-2222-2222-2222-222222222222',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '+92303XXXXXXX',              -- REPLACE: verified number #4
     'Real Recipient 4 (Globex)', 'opted_in', 'manual'),

    ('22222222-2222-2222-2222-222222222222',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '+92304XXXXXXX',              -- REPLACE: verified number #5
     'Real Recipient 5 (Globex)', 'opted_in', 'manual')
ON CONFLICT (tenant_id, phone_e164) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. Sanity check
-- ---------------------------------------------------------------
SELECT
    t.name AS tenant,
    (SELECT COUNT(*) FROM wabas w WHERE w.tenant_id = t.id) AS wabas,
    (SELECT COUNT(*) FROM phone_numbers p WHERE p.tenant_id = t.id) AS phone_numbers,
    (SELECT COUNT(*) FROM templates tp WHERE tp.tenant_id = t.id) AS templates,
    (SELECT COUNT(*) FROM contacts c WHERE c.tenant_id = t.id) AS contacts
FROM tenants t
WHERE t.id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
)
ORDER BY t.name;

-- Expected output (assuming earlier isolation-test seed also ran):
--   Acme Corp    | wabas: 1 | phone_numbers: 1 | templates: 1 | contacts: 6
--   Globex Corp  | wabas: 0 | phone_numbers: 0 | templates: 0 | contacts: 5
