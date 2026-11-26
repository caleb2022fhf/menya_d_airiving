
import { createClient } from "@libsql/client";
import {
    createHash,
    randomBytes,
    randomUUID,
    timingSafeEqual
} from "node:crypto";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            message: "Method not allowed."
        });
    }

    try {
        const adminPassword = process.env.ADMIN_PASSWORD;
        const databaseUrl = process.env.TURSO_DATABASE_URL;
        const databaseToken = process.env.TURSO_AUTH_TOKEN;

        if (!adminPassword || !databaseUrl || !databaseToken) {
            return res.status(500).json({
                message: "Admin login is not configured on the server."
            });
        }

        const password = req.body?.password;

        if (typeof password !== "string" || !password) {
            return res.status(400).json({
                message: "Please enter the admin password."
            });
        }

        const submittedHash = createHash("sha256")
            .update(password)
            .digest();

        const correctHash = createHash("sha256")
            .update(adminPassword)
            .digest();

        if (!timingSafeEqual(submittedHash, correctHash)) {
            return res.status(401).json({
                message: "Incorrect admin password."
            });
        }

        const db = createClient({
            url: databaseUrl,
            authToken: databaseToken
        });

        const sessionToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256")
            .update(sessionToken)
            .digest("hex");

        const sessionId = randomUUID();
        const expiresAt = new Date(
            Date.now() + 8 * 60 * 60 * 1000
        ).toISOString();

        await db.execute({
            sql: `INSERT INTO admin_sessions
                  (id, token_hash, expires_at)
                  VALUES (?, ?, ?)`,
            args: [sessionId, tokenHash, expiresAt]
        });

        const secure = process.env.NODE_ENV === "production"
            ? "; Secure"
            : "";

        res.setHeader(
            "Set-Cookie",
            `admin_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`
        );

        return res.status(200).json({
            success: true,
            message: "Admin login successful."
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            message: "An unexpected login error occurred."
        });
    }
}
