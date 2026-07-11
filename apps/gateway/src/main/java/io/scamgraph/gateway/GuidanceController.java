package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사후 대응 가이드 — "사기 확인 후 지금 뭐하지?"에 답한다.
 * 탐지에서 끝나지 않고 신고·계좌 지급정지·차단까지 동반한다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Guidance", description = "사후 대응 가이드")
public class GuidanceController {

    @GetMapping("/guidance")
    @Operation(summary = "대응 가이드",
            description = "유형·등급별 즉시 조치 절차와 공식 신고 채널을 반환합니다.")
    public Map<String, Object> guidance(
            @RequestParam(defaultValue = "url") String kind,
            @RequestParam(defaultValue = "danger") String grade) {

        boolean urgent = "danger".equals(grade) || "warning".equals(grade);
        String headline = switch (grade) {
            case "danger" -> "🚨 지금 즉시 조치하세요";
            case "warning" -> "⚠️ 아래 절차로 확인·대응하세요";
            default -> "특이 위험은 없지만, 아래를 기억해 두세요";
        };

        List<Map<String, Object>> steps = new ArrayList<>();
        switch (kind) {
            case "phone" -> {
                steps.add(step("즉시 통화를 끊으세요",
                        "기관·가족을 사칭해도 개인정보·인증번호·계좌를 절대 알려주지 마세요.", null, null));
                steps.add(step("이미 송금했다면 즉시 지급정지",
                        "은행 콜센터 또는 금융감독원 1332로 계좌 지급정지를 요청하세요.", "금융감독원 1332", "tel:1332"));
                steps.add(step("경찰에 신고",
                        "112로 보이스피싱을 신고하세요.", "경찰 112", "tel:112"));
                steps.add(step("가족·지인에게 공유",
                        "같은 번호·수법에 당하지 않도록 알리세요.", null, null));
            }
            case "account" -> {
                steps.add(step("절대 송금하지 마세요",
                        "정상 거래로 보여도 확인 전에는 이체하지 마세요.", null, null));
                steps.add(step("이미 송금했다면 즉시 지급정지",
                        "은행/금융감독원 1332로 즉시 지급정지를 신청하세요.", "금융감독원 1332", "tel:1332"));
                steps.add(step("경찰에 신고",
                        "112로 사기 계좌를 신고하세요.", "경찰 112", "tel:112"));
            }
            default -> {
                steps.add(step("접속·입력을 즉시 중단",
                        "창을 닫고, 개인정보·인증번호 입력을 멈추세요.", null, null));
                steps.add(step("이미 입력했다면 비밀번호 변경",
                        "해당 서비스 비밀번호를 바꾸고, 카드사·은행에 연락하세요.", null, null));
                steps.add(step("피싱 신고",
                        "KISA 118로 피싱 사이트를 신고하세요.", "인터넷침해 118", "tel:118"));
                steps.add(step("경찰 사이버범죄 신고",
                        "온라인으로 접수하세요.", "사이버범죄 신고", "https://ecrm.police.go.kr"));
            }
        }

        List<Map<String, Object>> hotlines = List.of(
                hotline("경찰 신고", "tel:112"),
                hotline("금융감독원(지급정지)", "tel:1332"),
                hotline("인터넷침해대응(KISA)", "tel:118")
        );

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", kind);
        out.put("grade", grade);
        out.put("headline", headline);
        out.put("urgent", urgent);
        out.put("steps", steps);
        out.put("hotlines", hotlines);
        return out;
    }

    private static Map<String, Object> step(String title, String detail,
                                            String actionLabel, String actionHref) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", title);
        m.put("detail", detail);
        if (actionLabel != null && actionHref != null) {
            m.put("action", Map.of("label", actionLabel, "href", actionHref));
        }
        return m;
    }

    private static Map<String, Object> hotline(String name, String contact) {
        return Map.of("name", name, "contact", contact);
    }
}
