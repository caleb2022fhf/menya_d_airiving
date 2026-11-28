
import { handleUpload } from "@vercel/blob/client";
import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";

function getDatabase() {
    return createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    });
}

async function verifyAdmin(req) {
    const cookies = req.headers.cookie || "";

    const sessionCookie = cookies
        .split(";")
        .map(c => c.trim())
        .find(c => c.startsWith("admin_session="));

    if (!sessionCookie) return false;

    const token = decodeURIComponent(
        sessionCookie.substring("admin_session=".length)
    );

    const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

    const db = getDatabase();

    const result = await db.execute({
        sql: `SELECT id FROM admin_sessions
              WHERE token_hash = ?
              AND expires_at > ?`,
        args: [tokenHash, new Date().toISOString()]
    });

    return result.rows.length > 0;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            message: "Method not allowed."
        });
    }

    try {
        if (
            !process.env.TURSO_DATABASE_URL ||
            !process.env.TURSO_AUTH_TOKEN ||
            !process.env.BLOB_READ_WRITE_TOKEN
        ) {
            return res.status(500).json({
                message: "Server storage is not configured."
            });
        }

        const result = await handleUpload({
            request: req,
            body: req.body,

            onBeforeGenerateToken: async (pathname) => {
                const authenticated = await verifyAdmin(req);

                if (!authenticated) {
                    throw new Error("Admin authentication required.");
                }

                if (!pathname.toLowerCase().endsWith(".pdf")) {
                    throw new Error("Only PDF documents are allowed.");
                }

                const documentId = randomUUID();

                const filename = pathname
                    .split("/")
                    .pop()
                    .replace(/[^a-zA-Z0-9._-]/g, "_");

                return {
                    allowedContentTypes: ["application/pdf"],
                    maximumSizeInBytes: 20 * 1024 * 1024,
                    addRandomSuffix: true,
                    tokenPayload: JSON.stringify({
                        documentId,
                        filename
                    })
                };
            },

            onUploadCompleted: async ({ blob, tokenPayload }) => {
                const metadata = JSON.parse(tokenPayload);

                const db = getDatabase();

                await db.execute({
                    sql: `INSERT OR IGNORE INTO exam_documents
                          (id, filename, blob_url, status)
                          VALUES (?, ?, ?, 'uploaded')`,
                    args: [
                        metadata.documentId,
                        metadata.filename,
                        blob.url
                    ]
                });
            }
        });

        return res.status(200).json(result);

    } catch (error) {
        console.error("PDF upload error:", error);

        return res.status(400).json({
            message: error.message || "PDF upload failed."
        });
    }
}
