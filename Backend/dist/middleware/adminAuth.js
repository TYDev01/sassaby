"use strict";
/**
 * adminAuth middleware
 *
 * Protects admin-only endpoints.  The caller must supply one of:
 *   Authorization: Bearer <ADMIN_API_KEY>
 *
 * ADMIN_API_KEY is a long random secret set in the server environment variable.
 * It is never sent to the browser.  The Next.js frontend sends it from a
 * server-side API route or from an environment variable that does NOT have the
 * NEXT_PUBLIC_ prefix so it stays server-side.
 *
 * Generate a suitable key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuth = adminAuth;
function adminAuth(req, res, next) {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
        // Fail closed: if the secret is not configured, deny ALL requests
        res.status(503).json({ error: "Admin authentication is not configured on this server." });
        return;
    }
    const authHeader = req.headers.authorization ?? "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        res.status(401).json({ error: "Unauthorized. Bearer token required." });
        return;
    }
    // Constant-time comparison to prevent timing attacks
    const provided = Buffer.from(token);
    const expected = Buffer.from(adminKey);
    if (provided.length !== expected.length ||
        !require("crypto").timingSafeEqual(provided, expected)) {
        res.status(403).json({ error: "Forbidden. Invalid admin token." });
        return;
    }
    next();
}
