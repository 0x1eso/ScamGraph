-- ScamGraph 메타/신고 스키마

CREATE TABLE IF NOT EXISTS scans (
    id           BIGSERIAL PRIMARY KEY,
    target       TEXT        NOT NULL,
    kind         TEXT        NOT NULL,            -- url | phone | account
    risk_score   INT         NOT NULL DEFAULT 0,
    grade        TEXT        NOT NULL DEFAULT 'safe',
    reasons      JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scans_target ON scans (target);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_grade ON scans (grade);
CREATE INDEX IF NOT EXISTS idx_scans_kind ON scans (kind);

CREATE TABLE IF NOT EXISTS reports (
    id           BIGSERIAL PRIMARY KEY,
    target       TEXT        NOT NULL,
    kind         TEXT        NOT NULL,
    note         TEXT,
    reporter_ip  INET,
    status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | confirmed | rejected
    votes        INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

-- 위협 인텔리전스 피드 블록리스트 — 공개 피드(OpenPhish·URLhaus·ThreatFox·경찰청) 지표
CREATE TABLE IF NOT EXISTS blocklist (
    id           BIGSERIAL PRIMARY KEY,
    value        TEXT        NOT NULL,           -- 정규화된 지표 (host/domain/ip/phone)
    kind         TEXT        NOT NULL,           -- url | domain | ip | phone | account
    source       TEXT        NOT NULL,           -- openphish | urlhaus | threatfox | police_kr
    source_kind  TEXT        NOT NULL DEFAULT 'global',  -- global | gov
    detail       TEXT,                           -- 사람이 읽는 근거 문구
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (value, source)
);
CREATE INDEX IF NOT EXISTS idx_blocklist_value ON blocklist (value);
CREATE INDEX IF NOT EXISTS idx_blocklist_source ON blocklist (source);

-- 데모용 시드 지표 — 엔진 수집 전에도 /api/check 피드 대조가 즉시 동작
INSERT INTO blocklist (value, kind, source, source_kind, detail) VALUES
    ('secure-tosspay.info',      'domain', 'urlhaus',   'global', 'URLhaus 등재 · abuse.ch'),
    ('naver-security-check.xyz', 'domain', 'openphish', 'global', 'OpenPhish 등재 · 커뮤니티 피드'),
    ('kbstar-otp.live',          'domain', 'threatfox', 'global', 'ThreatFox IOC · abuse.ch'),
    ('cj-delivery-check.top',    'domain', 'openphish', 'global', 'OpenPhish 등재 · 커뮤니티 피드'),
    ('070-8890-1234',            'phone',  'police_kr', 'gov',    '경찰청 보이스피싱 주의 번호')
ON CONFLICT DO NOTHING;

-- 공개 API 키
CREATE TABLE IF NOT EXISTS api_keys (
    id           BIGSERIAL PRIMARY KEY,
    key          TEXT        NOT NULL UNIQUE,
    owner        TEXT,
    rate_limit   INT         NOT NULL DEFAULT 1000,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 데모용 시드 신고
INSERT INTO reports (target, kind, note, status, votes) VALUES
    ('cj-delivery-check.top', 'url', '택배 미수령 사칭 문자', 'confirmed', 42),
    ('kbstat-secure.click',   'url', 'KB 보안 인증 사칭',     'confirmed', 37),
    ('070-4123-9981',         'phone', '자동응답 보이스피싱', 'confirmed', 18)
ON CONFLICT DO NOTHING;
