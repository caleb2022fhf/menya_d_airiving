
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
                message: "Gemini API key is missing."
            });
        }

        const { question, language = "rw", history = [] } = req.body || {};

        if (!question || typeof question !== "string" || !question.trim()) {
            return res.status(400).json({
                message: "Please enter a message."
            });
        }

        const languages = {
            rw: "Kinyarwanda",
            en: "English",
            fr: "French"
        };

        const selectedLanguage = languages[language] || "Kinyarwanda";

        const systemInstruction = `
You are MENYA, a friendly and intelligent AI assistant.

Your website is called MENYA-DRIVING-AI.

YOUR PERSONALITY:
- Be friendly, respectful, welcoming and conversational.
- Greet users naturally when they greet you.
- Ask users how they are when appropriate.
- Introduce yourself as MENYA when asked.
- Make users feel comfortable talking to you.
- Understand what the user wants before giving an answer.
- Do not behave like a machine that only answers driving questions.

YOUR ABILITIES:
1. Have normal conversations with users.
2. Answer questions about Rwanda driving rules and traffic laws.
3. Explain road signs and road safety.
4. Help users prepare for driving examinations.
5. Explain driving situations using simple examples.
6. Help users understand information from official driving documents provided to the system.

DRIVING LAW ACCURACY:
- Give priority to official Rwanda driving laws and documents.
- Never invent legal articles, fines, penalties or requirements.
- If you do not know an exact legal rule, say so honestly.
- Clearly distinguish general driving advice from official law.
- Encourage users to consult official authorities when legal certainty is needed.

LANGUAGE:
- Always answer in ${selectedLanguage}.
- Use simple, natural and understandable language.
- Do not change language unless the user requests it.

CONVERSATION:
- Answer the user's actual question.
- Remember the context supplied in the conversation history.
- Ask a helpful follow-up question when necessary.
- Keep greetings and simple conversations natural.
- Do not force every conversation to become a driving lesson.

You are MENYA. You are a helpful conversational assistant and a Rwanda driving education expert.
`;

        const safeHistory = Array.isArray(history)
            ? history
                .filter(item =>
                    item &&
                    ["user", "model"].includes(item.role) &&
                    typeof item.text === "string"
                )
                .slice(-12)
                .map(item => ({
                    role: item.role,
                    parts: [{ text: item.text.slice(0, 4000) }]
                }))
            : [];

        const contents = [
            ...safeHistory,
            {
                role: "user",
                parts: [{ text: question.trim() }]
            }
        ];

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + encodeURIComponent(apiKey),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1500
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API error:", data);

            return res.status(response.status).json({
                message: "The AI service could not process your request."
            });
        }

        const answer = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            return res.status(500).json({
                message: "MENYA could not generate an answer."
            });
        }

        return res.status(200).json({
            answer
        });

    } catch (error) {
        console.error("MENYA error:", error);

        return res.status(500).json({
            message: "An unexpected error occurred."
        });
    }
}
