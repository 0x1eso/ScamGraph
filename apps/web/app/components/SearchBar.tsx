"use client";

// ScamGraph — 즉시 검색 UI
// 입력 → 250ms 디바운스 → gateway /api/search 호출 → 드롭다운 결과 패널 렌더.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useEffect, useRef, useState } from "react";
import { search, type SearchHit } from "@/lib/search";

// 타이핑 후 요청까지의 디바운스 지연.
const DEBOUNCE_MS = 250;

// 등급별 점 색상(디자인 토큰 재사용)과 한글 라벨. null 등급은 별도 처리.
const GRADE_COLOR: Record<NonNullable<SearchHit["grade"]>, string> = {
  danger: "var(--danger)",
  warning: "var(--warn)",
  caution: "#ca8a04",
  safe: "var(--accent-2)",
};

const GRADE_LABEL: Record<NonNullable<SearchHit["grade"]>, string> = {
  danger: "위험",
  warning: "경고",
  caution: "주의",
  safe: "안전",
};

function dotColor(grade: SearchHit["grade"]): string {
  return grade ? GRADE_COLOR[grade] : "var(--text-mute)";
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);

  // 디바운스 + 검색 실행. 빈 질의어는 요청하지 않고 패널을 닫는다.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      setLoading(false);
      setOpen(false);
      return;
    }

    // 뒤늦게 도착한 이전 질의 응답이 최신 상태를 덮어쓰지 않도록 방어.
    let cancelled = false;
    setOpen(true);

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      search(q)
        .then((res) => {
          if (cancelled) return;
          setHits(res.hits);
        })
        .catch(() => {
          // 데모 안전성: 실패해도 페이지를 무너뜨리지 않고 인라인 안내만 노출.
          if (cancelled) return;
          setHits([]);
          setError("검색을 사용할 수 없습니다");
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // 바깥 클릭 시 패널을 닫는다.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="searchbar" ref={rootRef}>
      <div className="sb-field">
        <span className="sb-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="sb-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hasQuery) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="위협 검색 — 도메인·번호·계좌·IP …"
          aria-label="위협 통합 검색"
          aria-expanded={open}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {open && hasQuery && (
        <div className="sb-panel">
          {loading && (
            <div className="sb-status" role="status" aria-live="polite">
              <span className="sb-spinner" aria-hidden="true" /> 검색 중…
            </div>
          )}

          {!loading && error && (
            <div className="sb-status sb-error" role="alert">
              ⚠ {error}
            </div>
          )}

          {!loading && !error && hits.length === 0 && (
            <div className="sb-status">결과 없음</div>
          )}

          {!loading && !error && hits.length > 0 && (
            <>
              <div className="sb-count">{hits.length}건</div>
              <ul className="sb-list" role="listbox" aria-label="검색 결과">
                {hits.map((hit) => (
                  <li className="sb-hit" role="option" aria-selected="false" key={hit.id}>
                    <span
                      className="sb-dot"
                      style={{ background: dotColor(hit.grade), boxShadow: `0 0 6px ${dotColor(hit.grade)}` }}
                      title={hit.grade ? GRADE_LABEL[hit.grade] : "미평가"}
                    />
                    <span className="sb-label" title={hit.label}>
                      {hit.label}
                    </span>
                    <span className="sb-type">{hit.type}</span>
                    {hit.risk !== null && <span className="sb-risk">{hit.risk}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <style>{SEARCH_BAR_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const SEARCH_BAR_CSS = `
.searchbar { position: relative; width: 100%; }

.sb-field {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 14px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.sb-field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 229, 192, 0.12);
}
.sb-icon { flex: 0 0 auto; display: flex; color: var(--text-mute); transition: color 0.18s ease; }
.sb-field:focus-within .sb-icon { color: var(--accent); }

.sb-input {
  flex: 1; min-width: 0;
  background: transparent;
  border: none; outline: none;
  color: var(--text);
  font-family: var(--mono);
  font-size: 15px;
  padding: 14px 0;
}
.sb-input::placeholder { color: var(--text-mute); }
.sb-input::-webkit-search-cancel-button { -webkit-appearance: none; }

.sb-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0; right: 0;
  z-index: 20;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  animation: sb-drop 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes sb-drop {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.sb-status {
  display: flex; align-items: center; gap: 8px;
  padding: 16px;
  font-family: var(--mono); font-size: 12px; color: var(--text-dim);
}
.sb-status.sb-error { color: var(--danger); }
.sb-spinner {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  animation: sb-pulse 1s ease-in-out infinite;
}
@keyframes sb-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

.sb-count {
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute);
}

.sb-list { list-style: none; max-height: 360px; overflow-y: auto; }
.sb-hit {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.15s ease;
}
.sb-hit:last-child { border-bottom: none; }
.sb-hit:hover { background: rgba(0, 229, 192, 0.06); }

.sb-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.sb-label {
  font-family: var(--mono); font-size: 13px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb-type {
  font-family: var(--mono); font-size: 10px; letter-spacing: 1px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--line); color: var(--text-dim);
  white-space: nowrap;
}
.sb-risk {
  font-family: var(--mono); font-size: 12px; font-weight: 700;
  color: var(--text-dim); white-space: nowrap;
}
`;
