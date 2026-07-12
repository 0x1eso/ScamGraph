#!/usr/bin/env bash
# URL → QR 코드(터미널). qrencode → python qrcode → URL 출력 순으로 폴백.
URL="${1:-}"
if [ -z "$URL" ]; then echo "사용: make qr URL=https://..."; exit 1; fi

if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$URL"
elif python3 -c "import qrcode" >/dev/null 2>&1; then
  python3 -c "import qrcode,sys; qr=qrcode.QRCode(border=1); qr.add_data(sys.argv[1]); qr.make(); qr.print_ascii()" "$URL"
else
  echo "  (qrencode/python-qrcode 없음 — URL 을 직접 공유하세요)"
fi
echo
echo "  🔗 $URL"
