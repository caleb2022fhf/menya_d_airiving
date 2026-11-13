
const chatMessages = document.getElementById("chatMessages");
const questionInput = document.getElementById("question");
const sendButton = document.getElementById("sendButton");
const languageSelect = document.getElementById("language");

languageSelect.value = MenyaApp.getLanguage();

let conversationHistory = [];

function getWelcomeMessage(language) {
    const messages = {
        rw: "Muraho neza! 👋 Nishimiye kukubona muri MENYA-DRIVING-AI. Nitwa MENYA. Ndi umufasha wawe mu kwiga amategeko y'umuhanda mu Rwanda. Wiriwe ute uyu munsi? Ni iki twaganiraho?",
        en: "Hello! 👋 Welcome to MENYA-DRIVING-AI. My name is MENYA. I am your assistant for learning Rwanda's driving rules. How are you today? What would you like to talk about?",
        fr: "Bonjour ! 👋 Bienvenue sur MENYA-DRIVING-AI. Je m'appelle MENYA. Je suis votre assistant pour apprendre le code de la route au Rwanda. Comment allez-vous aujourd'hui ? De quoi aimeriez-vous parler ?"
    };

    return messages[language] || messages.rw;
}

function addMessage(message, sender) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${sender}-message`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = sender === "ai" ? "M" : "Y";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message;

    messageElement.appendChild(avatar);
    messageElement.appendChild(bubble);

    // Text-to-Speech button for MENYA messages
    if (sender === "ai") {
        const speakButton = document.createElement("button");

        speakButton.type = "button";
        speakButton.textContent = "🔊 Listen";
        speakButton.className = "speak-button";
        speakButton.style.marginTop = "8px";
        speakButton.style.padding = "7px 12px";
        speakButton.style.borderRadius = "8px";
        speakButton.style.cursor = "pointer";

        speakButton.addEventListener("click", () => {
            menyaSpeak(bubble.textContent);
        });

        messageElement.appendChild(speakButton);
    }

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return bubble;
}

addMessage(getWelcomeMessage(languageSelect.value), "ai");

languageSelect.addEventListener("change", () => {
    MenyaApp.setLanguage(languageSelect.value);
});

async function sendQuestion() {
    const question = questionInput.value.trim();

    if (!question || sendButton.disabled) {
        return;
    }

    addMessage(question, "user");

    const previousHistory = [...conversationHistory];

    conversationHistory.push({
        role: "user",
        text: question
    });

    questionInput.value = "";
    sendButton.disabled = true;
    sendButton.textContent = "Thinking...";

    const loadingMessage = addMessage("Ndimo gutekereza...", "ai");

    try {
        const response = await MenyaApp.request("/chat", {
            method: "POST",
            body: JSON.stringify({
                question: question,
                language: languageSelect.value,
                history: previousHistory
            })
        });

        if (!response.answer) {
            throw new Error("The AI did not return an answer.");
        }

        loadingMessage.textContent = response.answer;

        conversationHistory.push({
            role: "model",
            text: response.answer
        });

    } catch (error) {
        conversationHistory.pop();

        loadingMessage.textContent =
            "Ntabwo nshoboye gusubiza ubu. Ongera ugerageze.";

        console.error(error);

    } finally {
        sendButton.disabled = false;
        sendButton.textContent = "Send";
        questionInput.focus();
    }
}

sendButton.addEventListener("click", sendQuestion);

questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendQuestion();
    }
});

// MENYA TEXT-TO-SPEECH
function menyaSpeak(text) {
    if (!("speechSynthesis" in window)) {
        alert("Your browser does not support Text-to-Speech.");
        return;
    }

    if (!text || !text.trim()) {
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text.trim());

    const language = languageSelect.value;

    const languageCodes = {
        rw: "rw-RW",
        en: "en-US",
        fr: "fr-FR"
    };

    const voices = window.speechSynthesis.getVoices();

    let selectedVoice = null;

    if (language === "rw") {
        selectedVoice = voices.find(voice =>
            voice.lang.toLowerCase().startsWith("rw")
        );
    } else if (language === "en") {
        selectedVoice = voices.find(voice =>
            voice.lang.toLowerCase().startsWith("en")
        );
    } else if (language === "fr") {
        selectedVoice = voices.find(voice =>
            voice.lang.toLowerCase().startsWith("fr")
        );
    }

    speech.lang = languageCodes[language] || "rw-RW";
    speech.rate = 0.85;
    speech.pitch = 1;

    if (selectedVoice) {
        speech.voice = selectedVoice;
    }

    window.speechSynthesis.speak(speech);
}
