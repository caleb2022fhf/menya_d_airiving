
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            authenticated: false,
            message: "Method not allowed."
        });
    }

    try {
        const databaseUrl = process.env.TURSO_DATABASE_URL;
        const databaseToken = process.env.TURSO_AUTH_TOKEN;

        if (!databaseUrl || !databaseToken) {
            return res.status(500).json({
                authenticated: false,
                message: "Database is not configured."
            });
        }

        const cookies = req.headers.cookie || "";
        const sessionCookie = cookies
            .split(";")
            .map(cookie => cookie.trim())
            .find(cookie => cookie.startsWith("admin_session="));

        if (!sessionCookie) {
            return res.status(401).json({
                authenticated: false,
                message: "Please sign in."
            });
        }

        const sessionToken = decodeURIComponent(
            sessionCookie.substring("admin_session=".length)
        );

        const tokenHash = createHash("sha256")
            .update(sessionToken)
            .digest("hex");

        const db = createClient({
            url: databaseUrl,
            authToken: databaseToken
        });

        const result = await db.execute({
            sql: `SELECT id
                  FROM admin_sessions
                  WHERE token_hash = ?
                  AND expires_at > ?`,
            args: [tokenHash, new Date().toISOString()]
        });

        if (result.rows.length === 0) {
            res.setHeader("Set-Cookie",
                "admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");

            return res.status(401).json({
                authenticated: false,
                message: "Your session has expired. Please sign in again."
            });
        }

        return res.status(200).json({
            authenticated: true
        });

    } catch (error) {
        console.error("Admin session verification error:", error);

        return res.status(500).json({
            authenticated: false,
            message: "Could not verify your admin session."
        });
    }
}
