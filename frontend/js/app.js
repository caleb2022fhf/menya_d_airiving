
const MenyaApp = {
    apiBase: "/api",

    getLanguage() {
        return localStorage.getItem("menya_language") || "rw";
    },

    setLanguage(language) {
        localStorage.setItem("menya_language", language);
    },

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Request failed");
            }

            return data;
        } catch (error) {
            console.error("MENYA DRIVING AI:", error);
            throw error;
        }
    }
};

window.MenyaApp = MenyaApp;
