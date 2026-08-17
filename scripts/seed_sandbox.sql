-- ============================================================
-- SANDBOX SEED for Alpha Education Limited
-- Registers: sandbox WABA, phone number, approved template,
--            and one test recipient contact.
-- Run in Supabase SQL Editor as `postgres`. Idempotent.
-- ============================================================

-- Constants (from your data)
--   Alpha Education tenant: d206b6b3-cc46-4d67-a1f2-ecb5399c9fdd
--   Main Office branch:     2031d9f1-7749-411f-86f8-c85074cbbed5

-- ---------------------------------------------------------------
-- 1. Register the Meta sandbox WABA under Alpha Education
-- ---------------------------------------------------------------
INSERT INTO wabas (
    id, tenant_id, meta_waba_id, business_name, waba_type, status
) VALUES (
    'aaaaaaaa-a1ed-a1ed-a1ed-aaaaaaaaaaaa',   -- deterministic UUID (a1ed = alpha ed)
    'd206b6b3-cc46-4d67-a1f2-ecb5399c9fdd',   -- Alpha Education Limited
    '1049671297638323',                        -- Meta's real WABA ID
    'Alpha Education Sandbox',
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
    'bbbbbbbb-a1ed-a1ed-a1ed-bbbbbbbbbbbb',
    'd206b6b3-cc46-4d67-a1f2-ecb5399c9fdd',
    'aaaaaaaa-a1ed-a1ed-a1ed-aaaaaaaaaaaa',
    '1220657667800081',                        -- Meta's phone number ID
    '+92 3219032174',
    TRUE,
    'active'
)
ON CONFLICT (meta_phone_number_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Register the approved template with NAMED variables
-- variable_definitions uses `name` (not `index`) — matches {{one}}, {{two}} etc.
-- ---------------------------------------------------------------
INSERT INTO templates (
    id, tenant_id, waba_id, name, language_code, category, status,
    body_text, variable_definitions
) VALUES (
    'cccccccc-a1ed-a1ed-a1ed-cccccccccccc',
    'd206b6b3-cc46-4d67-a1f2-ecb5399c9fdd',
    'aaaaaaaa-a1ed-a1ed-a1ed-aaaaaaaaaaaa',
    'faculty_meeting_update_v2',
    'en',
    'utility',
    'approved',
    'Dear Faculty Members,

Please be informed that a faculty meeting has been scheduled for {{one}} to discuss {{two}}.

Meeting Details:
Agenda: {{three}}
Date: {{four}}
Time: {{five}}
Arranged by: {{six}}

💻 Note: The meeting link and further instructions will be shared via {{seven}} by {{eight}}.

Your timely presence is highly appreciated.

Best regards,
{{nine}} Department',
    '[
      {"name": "one",   "description": "Meeting date/day",           "example": "Monday"},
      {"name": "two",   "description": "Meeting topic",              "example": "curriculum review"},
      {"name": "three", "description": "Agenda summary",             "example": "Fall 2026 syllabus updates"},
      {"name": "four",  "description": "Full date",                  "example": "Aug 25, 2026"},
      {"name": "five",  "description": "Time with timezone",         "example": "3:00 PM PKT"},
      {"name": "six",   "description": "Organizer name",             "example": "Dr. Ahmed Khan"},
      {"name": "seven", "description": "Communication channel",      "example": "email"},
      {"name": "eight", "description": "Sender/coordinator name",    "example": "Admin Office"},
      {"name": "nine",  "description": "Department name",            "example": "Computer Science"}
    ]'::jsonb
)
ON CONFLICT (tenant_id, waba_id, name, language_code) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Add your one test recipient under Main Office branch
-- REPLACE +92300XXXXXXX with your actual verified test number.
-- ---------------------------------------------------------------
INSERT INTO contacts (
    tenant_id, branch_id, phone_e164, full_name, opt_in_status, source
) VALUES (
    'd206b6b3-cc46-4d67-a1f2-ecb5399c9fdd',
    '2031d9f1-7749-411f-86f8-c85074cbbed5',
    '+923302488308',                           -- REPLACE with real test number
    'Test Recipient (Alpha)',
    'opted_in',
    'manual'
)
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
WHERE t.id = 'd206b6b3-cc46-4d67-a1f2-ecb5399c9fdd';

-- Expected:
-- Alpha Education Limited | wabas: 1 | phone_numbers: 1 | templates: 1 | contacts: 51
--   (50 existing seeded + 1 new test recipient)