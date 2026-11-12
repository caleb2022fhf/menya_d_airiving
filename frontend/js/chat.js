
const chatMessages = document.getElementById("chatMessages");
const questionInput = document.getElementById("question");
const sendButton = document.getElementById("sendButton");
const languageSelect = document.getElementById("language");

languageSelect.value = MenyaApp.getLanguage();

languageSelect.addEventListener("change", () => {
    MenyaApp.setLanguage(languageSelect.value);
});

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

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return bubble;
}

async function sendQuestion() {
    const question = questionInput.value.trim();

    if (!question || sendButton.disabled) {
        return;
    }

    addMessage(question, "user");

    questionInput.value = "";
    sendButton.disabled = true;
    sendButton.textContent = "Thinking...";

    const loadingMessage = addMessage("Ndimo gutekereza...", "ai");

    try {
        const response = await MenyaApp.request("/chat", {
            method: "POST",
            body: JSON.stringify({
                question: question,
                language: languageSelect.value
            })
        });

        if (!response.answer) {
            throw new Error("The AI did not return an answer.");
        }

        loadingMessage.textContent = response.answer;

    } catch (error) {
        loadingMessage.textContent =
            "Sorry, I could not get an answer. Please try again later.";
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
