package io.scamgraph.gateway;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.draw.LineSeparator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사건 파일(Case File) PDF — 스캔→그래프 킬샷의 물증 도시에를 경찰 핸드오프용 서류철로 굳힌다.
 * {@link CampaignController#campaign(String)} 이 복원한 조직 인프라(인벤토리·공유 pivot·권고)를
 * 그대로 렌더하되, provenance(출처·근거)를 갖춘 <b>증거 리포트</b> 형식으로 출력한다.
 * <p>
 * <b>폰트 주의:</b> OpenPDF 기본 Helvetica(WinAnsi)는 한글을 임베딩하지 못한다. 그래서
 * 섹션 헤더/라벨은 영문으로 고정하고, 데이터 값은 ASCII만 남기도록 정제(한글 은행명·라벨은 탈락)한다.
 * 한글 recommendation 은 렌더 실패 위험이 있어 구조화 데이터로부터 영문 권고를 재구성한다.
 * CJK 폰트 임베딩(예: NanumGothic + BaseFont.IDENTITY_H)은 후속 과제(P2).
 * <p>
 * <b>데모 세이프:</b> campaign() 은 항상 무언가를 반환(데모 조직 폴백)하고, PDF 생성은 전부
 * try/catch 로 감싸 실패 시 최소 유효 PDF(또는 최후엔 200 JSON)로 응답한다. 절대 500 을 내지 않는다.
 */
@RestController
@RequestMapping("/api/campaign")
@CrossOrigin(origins = "*")
@Tag(name = "Campaign", description = "사기 조직 사건 파일 — PDF 증거 도시에(경찰 핸드오프)")
public class CasePdfController {

    private static final Logger log = LoggerFactory.getLogger(CasePdfController.class);

    // ── 팔레트(관제실 톤): 경고 강조 + 잉크/뮤트 ─────────────────────────
    private static final Color ACCENT = new Color(0xE0, 0x4F, 0x3A);
    private static final Color INK = new Color(0x1A, 0x1A, 0x1A);
    private static final Color MUTED = new Color(0x6B, 0x6B, 0x6B);
    private static final Color RULE_COLOR = new Color(0xC8, 0xC8, 0xC8);

    // ── 서체: 라벨/헤더는 Helvetica, 증거 값은 Courier(모노스페이스로 포렌식 느낌) ──
    private static final Font F_TITLE = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 20f, ACCENT);
    private static final Font F_SUB = FontFactory.getFont(FontFactory.HELVETICA, 9f, MUTED);
    private static final Font F_META = FontFactory.getFont(FontFactory.COURIER, 9f, INK);
    private static final Font F_SECTION = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12f, INK);
    private static final Font F_LABEL = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9.5f, INK);
    private static final Font F_DATA = FontFactory.getFont(FontFactory.COURIER, 9f, INK);
    private static final Font F_BODY = FontFactory.getFont(FontFactory.HELVETICA, 9.5f, INK);
    private static final Font F_DISCLAIMER = FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7.5f, MUTED);

    private final CampaignController campaignController;

    public CasePdfController(CampaignController campaignController) {
        this.campaignController = campaignController;
    }

    @GetMapping("/pdf")
    @Operation(summary = "사건 파일 PDF 다운로드",
            description = "엔티티가 속한 사기 조직의 사건 파일을 PDF 증거 도시에로 반환합니다. "
                    + "판정·인벤토리·공유 인프라 물증·권고·증거 해시를 포함하며, 경찰 핸드오프용입니다.")
    public ResponseEntity<byte[]> pdf(@RequestParam String value) {
        Map<String, Object> data;
        try {
            data = campaignController.campaign(value);
        } catch (Exception e) {
            // 데이터 조회 실패에도 500 금지 — 최소 유효 PDF 로 응답.
            log.warn("case pdf: campaign() 실패 → 최소 PDF (valueLen={})",
                    value == null ? 0 : value.length(), e);
            return safeMinimal("Case data unavailable.", "UNKNOWN");
        }

        String caseId = filenameId(data.get("campaign_id"));
        try {
            return pdfResponse(renderPdf(data), caseId);
        } catch (Exception e) {
            log.error("case pdf: 렌더 실패 → 최소 PDF 폴백 (case={})", caseId, e);
            return safeMinimal("Case File render failed - minimal dossier.", caseId);
        }
    }

    // ── PDF 렌더 ──────────────────────────────────────────────────
    private byte[] renderPdf(Map<String, Object> data) throws DocumentException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 48, 48, 54, 54);
        PdfWriter.getInstance(doc, baos);
        doc.open();
        try {
            boolean found = Boolean.TRUE.equals(data.get("found"));
            String caseId = blankTo(ascii(data.get("campaign_id")), "UNATTRIBUTED");
            String grade = String.valueOf(data.get("risk_grade"));
            String label = ascii(data.get("label"));
            Map<String, Object> inventory = asMap(data.get("inventory"));
            List<Object> pivots = list(data.get("pivots"));

            header(doc, caseId);

            if (!found) {
                section(doc, "JUDGMENT");
                doc.add(new Paragraph("No scam-organization attribution for the queried entity.", F_BODY));
                kv(doc, "Query: ", blankTo(label, "(n/a)"), F_DATA);
                kv(doc, "Risk Grade: ", grade.toUpperCase(), gradeFont(grade));
            } else {
                section(doc, "JUDGMENT");
                kv(doc, "Risk Grade: ", grade.toUpperCase(), gradeFont(grade));
                kv(doc, "Entity Count: ", String.valueOf(data.getOrDefault("entity_count", 0)), F_DATA);
                if (!label.isBlank()) {
                    kv(doc, "Organization: ", label, F_DATA);
                }
                if (data.get("first_seen") != null) {
                    kv(doc, "First Seen: ", ascii(data.get("first_seen")), F_DATA);
                }

                section(doc, "INVENTORY");
                inventoryBlock(doc, "Domains", list(inventory.get("domains")));
                inventoryBlock(doc, "Phones", list(inventory.get("phones")));
                inventoryBlock(doc, "Accounts", list(inventory.get("accounts")));
                inventoryBlock(doc, "IPs", list(inventory.get("ips")));

                section(doc, "SHARED PIVOTS");
                doc.add(new Paragraph(
                        "Shared infrastructure proving these entities form one organization:", F_BODY));
                if (pivots.isEmpty()) {
                    doc.add(new Paragraph("    (no shared-infrastructure pivots identified)", F_DATA));
                } else {
                    for (Object p : pivots) {
                        pivotBlock(doc, asMap(p));
                    }
                }

                section(doc, "RECOMMENDATION");
                doc.add(new Paragraph(deriveRecommendation(inventory, pivots), F_BODY));
            }

            footer(doc, evidenceHash(inventory));
        } finally {
            doc.close();
        }
        return baos.toByteArray();
    }

    private void header(Document doc, String caseId) throws DocumentException {
        doc.add(new Paragraph("SCAMGRAPH CASE FILE", F_TITLE));
        doc.add(new Paragraph("Threat Intelligence Evidence Dossier", F_SUB));
        Paragraph meta = new Paragraph();
        meta.add(new Chunk("CASE ID: ", F_LABEL));
        meta.add(new Chunk(caseId, F_META));
        meta.add(new Chunk("    GENERATED: ", F_LABEL));
        meta.add(new Chunk(Instant.now().toString(), F_META));
        meta.setSpacingBefore(2f);
        doc.add(meta);
        rule(doc);
    }

    private void footer(Document doc, String hash) throws DocumentException {
        rule(doc);
        Paragraph h = new Paragraph();
        h.add(new Chunk("EVIDENCE HASH (SHA-256/16): ", F_LABEL));
        h.add(new Chunk(hash, F_META));
        h.setSpacingBefore(2f);
        doc.add(h);
        // 한글 원문 disclaimer("수사 참고자료 · provenance 제공(법적 증거 확정 아님)")은 폰트 임베딩 전까지 영문으로.
        doc.add(new Paragraph(
                "Investigative reference - provenance provided (not a legal determination of evidence).",
                F_DISCLAIMER));
    }

    private void inventoryBlock(Document doc, String label, List<Object> values) throws DocumentException {
        Paragraph head = new Paragraph(label + " (" + values.size() + ")", F_LABEL);
        head.setSpacingBefore(4f);
        doc.add(head);
        if (values.isEmpty()) {
            doc.add(new Paragraph("    (none)", F_DATA));
            return;
        }
        for (Object v : values) {
            String s = ascii(v);
            if (s.isBlank()) continue;
            Paragraph line = new Paragraph("    " + s, F_DATA);
            line.setSpacingAfter(1f);
            doc.add(line);
        }
    }

    private void pivotBlock(Document doc, Map<String, Object> p) throws DocumentException {
        List<Object> connects = list(p.get("connects"));
        Paragraph head = new Paragraph();
        head.add(new Chunk(pivotLabel(ascii(p.get("type"))) + "  ", F_LABEL));
        head.add(new Chunk(ascii(p.get("value")), F_DATA));
        head.add(new Chunk("  ->  connects " + connects.size() + " target(s)", F_BODY));
        head.setSpacingBefore(4f);
        doc.add(head);
        String joined = joinAscii(connects);
        if (!joined.isBlank()) {
            doc.add(new Paragraph("    " + joined, F_DATA));
        }
    }

    private void section(Document doc, String title) throws DocumentException {
        Paragraph p = new Paragraph(title, F_SECTION);
        p.setSpacingBefore(12f);
        p.setSpacingAfter(4f);
        doc.add(p);
    }

    private void kv(Document doc, String label, String value, Font valueFont) throws DocumentException {
        Paragraph p = new Paragraph();
        p.add(new Chunk(label, F_LABEL));
        p.add(new Chunk(value, valueFont));
        p.setSpacingAfter(2f);
        doc.add(p);
    }

    private void rule(Document doc) throws DocumentException {
        LineSeparator ls = new LineSeparator(0.6f, 100f, RULE_COLOR, Element.ALIGN_CENTER, -3f);
        Paragraph p = new Paragraph();
        p.add(new Chunk(ls));
        p.setSpacingBefore(6f);
        p.setSpacingAfter(6f);
        doc.add(p);
    }

    // ── 최소 유효 PDF(폴백) — 렌더가 실패해도 200/PDF 를 지킨다. 최후엔 200 JSON. ──
    private ResponseEntity<byte[]> safeMinimal(String message, String caseId) {
        try {
            return pdfResponse(minimalPdf(message), caseId);
        } catch (Exception e) {
            log.error("case pdf: 최소 PDF 도 실패 → JSON 에러 응답", e);
            byte[] body = "{\"error\":\"pdf_generation_failed\"}".getBytes(StandardCharsets.UTF_8);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
        }
    }

    private byte[] minimalPdf(String message) throws DocumentException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 48, 48, 54, 54);
        PdfWriter.getInstance(doc, baos);
        doc.open();
        try {
            doc.add(new Paragraph("SCAMGRAPH CASE FILE", F_TITLE));
            doc.add(new Paragraph(ascii(message), F_BODY));
            doc.add(new Paragraph(
                    "Investigative reference - provenance provided (not a legal determination of evidence).",
                    F_DISCLAIMER));
        } finally {
            doc.close();
        }
        return baos.toByteArray();
    }

    // ── HTTP 응답 구성 ────────────────────────────────────────────
    private static ResponseEntity<byte[]> pdfResponse(byte[] pdf, String caseId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(
                ContentDisposition.attachment().filename("scamgraph-case-" + caseId + ".pdf").build());
        headers.setContentLength(pdf.length);
        return new ResponseEntity<>(pdf, headers, HttpStatus.OK);
    }

    // ── 권고문 재구성(영문·구조화 데이터 기반. 한글 원문은 폰트 문제로 미사용) ──────
    private static String deriveRecommendation(Map<String, Object> inventory, List<Object> pivots) {
        int d = list(inventory.get("domains")).size();
        int p = list(inventory.get("phones")).size();
        int a = list(inventory.get("accounts")).size();
        int ip = list(inventory.get("ips")).size();
        int total = d + p + a + ip;

        List<String> actions = new ArrayList<>();
        if (d > 0) actions.add("block " + d + " domain(s)");
        if (a > 0) actions.add("freeze " + a + " account(s)");
        if (p > 0) actions.add("report " + p + " phone number(s)");
        if (ip > 0) actions.add("blackhole " + ip + " IP(s)");

        StringBuilder sb = new StringBuilder();
        sb.append("Identified ").append(total).append(" organization infrastructure element(s). ");
        sb.append("Recommended action: ")
                .append(actions.isEmpty() ? "monitor related infrastructure" : String.join(", ", actions))
                .append(". ");
        if (!pivots.isEmpty()) {
            Map<String, Object> top = asMap(pivots.get(0));
            int n = list(top.get("connects")).size();
            sb.append("Blocking shared pivot ").append(ascii(top.get("value")))
                    .append(" neutralizes ").append(n).append(" connected target(s) at once.");
        }
        return sb.toString();
    }

    /** 정렬 없이 인벤토리 값을 관측 순서대로 이어붙여 SHA-256 → 앞 16 hex(내용 동일 시 해시 동일). */
    private static String evidenceHash(Map<String, Object> inventory) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (String key : List.of("domains", "phones", "accounts", "ips")) {
                for (Object v : list(inventory.get(key))) {
                    md.update(String.valueOf(v).getBytes(StandardCharsets.UTF_8));
                    md.update((byte) '\n');
                }
            }
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) {
                sb.append(String.format("%02x", b));
            }
            return sb.substring(0, 16);
        } catch (Exception e) {
            return "0000000000000000";
        }
    }

    private static String pivotLabel(String type) {
        return switch (type) {
            case "shared_ip" -> "Shared IP";
            case "shared_registrant" -> "Shared Registrant";
            case "shared_cert" -> "Shared Certificate";
            default -> type.isBlank() ? "Shared Pivot" : type;
        };
    }

    private static Font gradeFont(String grade) {
        Color c = switch (grade == null ? "" : grade) {
            case "danger" -> new Color(0xD1, 0x3A, 0x2E);
            case "warning" -> new Color(0xE0, 0x7A, 0x1F);
            case "caution" -> new Color(0xC9, 0xA2, 0x27);
            case "safe" -> new Color(0x2E, 0x8B, 0x57);
            default -> MUTED;
        };
        return FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9.5f, c);
    }

    // ── ASCII 정제: 비-ASCII(한글 등) 탈락 + 공백 정규화 + 빈 괄호 제거 ─────────
    private static String ascii(Object o) {
        if (o == null) return "";
        String s = o.toString();
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 0x20 && c <= 0x7E) {
                sb.append(c);
            } else if (Character.isWhitespace(c)) {
                sb.append(' ');
            }
            // 그 외(예: 한글)는 탈락 — WinAnsi 기본 폰트로 렌더 불가하므로 안전하게 제거.
        }
        return sb.toString().replaceAll("\\(\\s*\\)", "").replaceAll("\\s+", " ").trim();
    }

    private static String joinAscii(List<Object> items) {
        StringBuilder sb = new StringBuilder();
        for (Object it : items) {
            String s = ascii(it);
            if (s.isBlank()) continue;
            if (sb.length() > 0) sb.append(", ");
            sb.append(s);
        }
        return sb.toString();
    }

    /** Content-Disposition 파일명용 안전 id: ASCII 영숫자/-/_ 만 허용, 비면 UNKNOWN. */
    private static String filenameId(Object campaignId) {
        String id = ascii(campaignId).replaceAll("[^A-Za-z0-9_-]", "");
        return id.isBlank() ? "UNKNOWN" : id;
    }

    private static String blankTo(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object o) {
        if (o instanceof List<?> l) {
            return new ArrayList<>((List<Object>) l);
        }
        return List.of();
    }

    private static Map<String, Object> asMap(Object o) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (o instanceof Map<?, ?> m) {
            for (Map.Entry<?, ?> e : m.entrySet()) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        return out;
    }
}
