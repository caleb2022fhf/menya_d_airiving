
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            message: "Method not allowed"
        });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                message: "AI API key is not configured."
            });
        }

        const { question, language } = req.body || {};

        if (!question || typeof question !== "string" || !question.trim()) {
            return res.status(400).json({
                message: "Please enter your question."
            });
        }

        if (question.length > 5000) {
            return res.status(400).json({
                message: "Your question is too long."
            });
        }

        const languages = {
            rw: "Kinyarwanda",
            en: "English",
            fr: "French"
        };

        const selectedLanguage = languages[language] || "Kinyarwanda";

        const instructions = `
You are MENYA DRIVING AI, an educational assistant
specialized in Rwanda driving rules and road safety.

Answer the user's question in ${selectedLanguage}.

Rules:
1. Explain driving rules clearly and simply.
2. Focus on Rwanda and its traffic laws.
3. Never invent legal articles, fines, penalties,
   road signs or legal requirements.
4. If you are unsure about a specific legal rule,
   clearly say that it needs verification in the
   official Rwanda traffic laws.
5. Give practical examples when useful.
6. Prioritize road safety.
7. If a question is unrelated to driving, politely
   explain that your main purpose is driving education.
8. Do not claim to have read PDFs unless their
   contents have actually been provided to you.
`;

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: instructions }]
                    },
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: question.trim() }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 1500
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API error:", data);

            return res.status(502).json({
                message: "The AI service could not answer. Please try again."
            });
        }

        const answer = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            return res.status(502).json({
                message: "The AI did not return an answer."
            });
        }

        return res.status(200).json({
            answer: answer
        });

    } catch (error) {
        console.error("Chat API error:", error);

        return res.status(500).json({
            message: "An internal server error occurred."
        });
    }
}
