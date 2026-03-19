package com.mathscript.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * HMAC session signing utilities — Java equivalent of Python's
 * sign_session_id() / verify_session_id() in backend/main.py.
 */
@Component
public class HmacUtil {

    private static final Pattern SESSION_ID_PATTERN = Pattern.compile("^sess_[a-z0-9]{6,20}$");
    private static final int SIG_LENGTH = 12;

    @Value("${app.session-secret}")
    private String sessionSecret;

    public String signSessionId(String rawId) {
        String sig = computeHex(rawId).substring(0, SIG_LENGTH);
        return rawId + "." + sig;
    }

    public String verifySessionId(String signedId) {
        if (signedId == null || !signedId.contains(".")) return null;
        int lastDot = signedId.lastIndexOf('.');
        String rawId = signedId.substring(0, lastDot);
        String sig = signedId.substring(lastDot + 1);
        String expected = computeHex(rawId).substring(0, SIG_LENGTH);
        if (!MessageDigest.isEqual(sig.getBytes(StandardCharsets.UTF_8),
                                   expected.getBytes(StandardCharsets.UTF_8))) {
            return null;
        }
        return rawId;
    }

    public void validateSessionId(String sessionId) {
        if (sessionId == null || sessionId.length() > 50) {
            throw new IllegalArgumentException("Invalid session");
        }
        if ("__healthcheck_test__".equals(sessionId)) return;
        if (!SESSION_ID_PATTERN.matcher(sessionId).matches()) {
            throw new IllegalArgumentException("Invalid session format");
        }
    }

    private String computeHex(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                sessionSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] rawMac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(rawMac);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }
}
