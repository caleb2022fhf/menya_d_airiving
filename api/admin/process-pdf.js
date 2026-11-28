
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";

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

async function uploadToGemini(pdfBuffer, filename) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    // Start Gemini file upload
    const startResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
            method: "POST",
            headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length":
                    String(pdfBuffer.length),
                "X-Goog-Upload-Header-Content-Type":
                    "application/pdf",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                file: {
                    display_name: filename
                }
            })
        }
    );

    if (!startResponse.ok) {
        throw new Error(
            "Gemini upload initialization failed: " +
            await startResponse.text()
        );
    }

    const uploadUrl =
        startResponse.headers.get("x-goog-upload-url");

    if (!uploadUrl) {
        throw new Error("Gemini did not return an upload URL.");
    }

    // Upload PDF bytes
    const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
            "Content-Length": String(pdfBuffer.length)
        },
        body: pdfBuffer
    });

    if (!uploadResponse.ok) {
        throw new Error(
            "Gemini PDF upload failed: " +
            await uploadResponse.text()
        );
    }

    const uploadData = await uploadResponse.json();

    if (!uploadData.file?.uri) {
        throw new Error("Gemini file URI was not returned.");
    }

    return uploadData.file;
}

async function extractQuestions(geminiFile) {
    const apiKey = process.env.GEMINI_API_KEY;

    const prompt = `
You are an expert assistant for Rwanda driving examination
question documents.

Read the entire supplied PDF carefully.

Extract the actual driving examination questions found
in the document.

For every question return:

1. The complete question text.
2. All available answer options.
3. The correct answer only when it is supported by the PDF.
4. An explanation based on the PDF.
5. The source page number.

IMPORTANT RULES:

- Do not invent questions.
- Do not invent answer options.
- Do not guess correct answers.
- If the correct answer is not clear, use null.
- Preserve the original meaning of the question.
- Include questions written in Kinyarwanda, English or French.
- Do not create duplicate questions.
- Extract as many genuine questions as possible.

Return ONLY valid JSON in this exact structure:

{
  "questions": [
    {
      "question": "Question text",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correct_answer": "A",
      "explanation": "Explanation from the document",
      "source_page": 1
    }
  ]
}
`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            file_data: {
                                mime_type: "application/pdf",
                                file_uri: geminiFile.uri
                            }
                        },
                        {
                            text: prompt
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            "Gemini question extraction failed: " +
            await response.text()
        );
    }

    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("");

    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Gemini returned invalid JSON.");
    }

    if (!Array.isArray(parsed.questions)) {
        throw new Error("No questions array was returned.");
    }

    return parsed.questions;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            message: "Method not allowed."
        });
    }

    try {
        if (!await verifyAdmin(req)) {
            return res.status(401).json({
                message: "Admin authentication required."
            });
        }

        if (
            !process.env.TURSO_DATABASE_URL ||
            !process.env.TURSO_AUTH_TOKEN ||
            !process.env.BLOB_READ_WRITE_TOKEN ||
            !process.env.GEMINI_API_KEY
        ) {
            return res.status(500).json({
                message: "Required server environment variables are missing."
            });
        }

        const { blobUrl } = req.body || {};

        if (!blobUrl || typeof blobUrl !== "string") {
            return res.status(400).json({
                message: "PDF blob URL is required."
            });
        }

        const db = getDatabase();

        // Find uploaded document
        const documentResult = await db.execute({
            sql: `SELECT id, filename, blob_url
                  FROM exam_documents
                  WHERE blob_url = ?`,
            args: [blobUrl]
        });

        if (documentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Uploaded PDF was not found in the database."
            });
        }

        const document = documentResult.rows[0];

        await db.execute({
            sql: `UPDATE exam_documents
                  SET status = 'processing'
                  WHERE id = ?`,
            args: [document.id]
        });

        // Download private PDF from Vercel Blob
        const pdfResponse = await fetch(document.blob_url, {
            headers: {
                Authorization:
                    `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`
            }
        });

        if (!pdfResponse.ok) {
            throw new Error(
                "Could not download PDF from Vercel Blob."
            );
        }

        const pdfBuffer = Buffer.from(
            await pdfResponse.arrayBuffer()
        );

        if (pdfBuffer.length > 20 * 1024 * 1024) {
            throw new Error("PDF exceeds the 20 MB limit.");
        }

        // Upload PDF to Gemini
        const geminiFile = await uploadToGemini(
            pdfBuffer,
            document.filename
        );

        // Extract questions
        const questions = await extractQuestions(geminiFile);

        let savedCount = 0;

        for (const item of questions) {
            if (
                !item.question ||
                typeof item.question !== "string" ||
                !item.options ||
                typeof item.options !== "object"
            ) {
                continue;
            }

            const options = {};

            for (const key of ["A", "B", "C", "D"]) {
                if (item.options[key]) {
                    options[key] = String(item.options[key]);
                }
            }

            if (Object.keys(options).length < 2) {
                continue;
            }

            const answer = ["A", "B", "C", "D"].includes(
                item.correct_answer
            ) && options[item.correct_answer]
                ? item.correct_answer
                : null;

            await db.execute({
                sql: `INSERT INTO exam_questions
                      (
                        id,
                        document_id,
                        question_text,
                        options_json,
                        correct_answer,
                        explanation,
                        source_page,
                        status
                      )
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                args: [
                    crypto.randomUUID(),
                    document.id,
                    item.question.trim(),
                    JSON.stringify(options),
                    answer,
                    item.explanation
                        ? String(item.explanation)
                        : null,
                    Number.isInteger(item.source_page)
                        ? item.source_page
                        : null
                ]
            });

            savedCount++;
        }

        await db.execute({
            sql: `UPDATE exam_documents
                  SET status = 'processed'
                  WHERE id = ?`,
            args: [document.id]
        });

        return res.status(200).json({
            success: true,
            message: "PDF processed successfully.",
            documentId: document.id,
            extractedQuestions: savedCount,
            status: "pending_review"
        });

    } catch (error) {
        console.error("PDF processing error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "PDF processing failed."
        });
    }
}
