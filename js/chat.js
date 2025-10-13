const chatWidget = document.getElementById("chat-widget");
const chatToggle = document.getElementById("chat-toggle");
const chatBody = document.getElementById("chat-body");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");

chatToggle.addEventListener("click", () => {
  chatWidget.style.display =
    chatWidget.style.display === "flex" ? "none" : "flex";
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage("You", text);
  chatInput.value = "";
  chatSend.disabled = true;

  try {
    console.debug("Sending payload:", { message: text });

    const res = await fetch("https://baldandbadgithubio-production-4f3f.up.railway.app/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // mode: "cors", // optional if you need explicit cors mode
      body: JSON.stringify({ message: text }),
    });

    console.debug("Fetch response status:", res.status, res.statusText);
    const contentType = res.headers.get("content-type") || "";
    console.debug("Response content-type:", contentType);

    // read raw text first (helps for debugging non-JSON responses)
    const raw = await res.text();
    console.debug("Raw response body:", raw);

    // Try to parse JSON if appropriate
    let data;
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.error("JSON parse error:", err);
        appendMessage("AI", `Server returned invalid JSON. Raw: ${raw}`);
        chatSend.disabled = false;
        return;
      }
    } else {
      // Not JSON — show raw text and bail (common when server returns HTML error page)
      appendMessage("AI", `Server returned non-JSON response (status ${res.status}). Raw: ${raw}`);
      chatSend.disabled = false;
      return;
    }

    console.debug("Parsed JSON:", data);

    // If data.reply missing or empty, show debug info
    if (!data || typeof data.reply !== "string" || data.reply.trim() === "") {
      appendMessage("AI", `No reply property in response. Full object: ${JSON.stringify(data)}`);
    } else {
      appendMessage("AI", data.reply);
    }
  } catch (err) {
    console.error("Fetch failed:", err);
    // If it's a CORS or network error you'll see details in console
    appendMessage("AI", `Error connecting to server: ${err.message || err}`);
  } finally {
    chatSend.disabled = false;
  }
}

function appendMessage(sender, message) {
  const msg = document.createElement("div");
  msg.innerHTML = `<b>${sender}:</b> ${message}`;
  chatBody.appendChild(msg);
  chatBody.scrollTop = chatBody.scrollHeight;
}

chatSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});
