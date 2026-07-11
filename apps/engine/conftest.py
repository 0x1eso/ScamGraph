"""pytest 부트스트랩 — 엔진 루트를 sys.path에 추가해 `from app.crawler import ...`를 가능하게 한다.

`cd apps/engine && python -m pytest` 로 실행하면 이 conftest.py 가 있는 디렉터리(엔진 루트)가
sys.path 앞에 삽입되어, `app` 패키지를 최상위 임포트할 수 있다. 네트워크·외부 의존성은
crawler.py 안에서 지연 임포트되므로 순수 규칙 테스트는 표준 라이브러리만으로 동작한다.
"""
import sys
from pathlib import Path

ENGINE_ROOT = Path(__file__).parent.resolve()
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))
