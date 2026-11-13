
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            message: "Method not allowed"
        });
    }

    try {
        const { text, language = "rw" } = req.body || {};

        if (!text || typeof text !== "string") {
            return res.status(400).json({
                message: "Text is required"
            });
        }

        if (language !== "rw") {
            return res.status(400).json({
                message: "This voice endpoint currently supports Kinyarwanda only."
            });
        }

        const response = await fetch(
            "https://api.pindo.io/ai/tts/rw/public",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    speech_rate: 0.9
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.data?.generated_audio_url) {
            return res.status(502).json({
                message: "Could not generate Kinyarwanda speech.",
                details: data
            });
        }

        const audioUrl = new URL(
            data.data.generated_audio_url,
            "https://api.pindo.io/"
        ).href;

        return res.status(200).json({
            audioUrl: audioUrl
        });

    } catch (error) {
        console.error("MENYA TTS ERROR:", error);

        return res.status(500).json({
            message: "Text-to-Speech failed."
        });
    }
}
