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

  // Add user message to chat
  appendMessage("You", text);
  chatInput.value = "";

  try {
    const res = await fetch("https://baldandbadgithubio-production.up.railway.app/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();

    appendMessage("AI", data.reply || "No reply.");
  } catch (err) {
    appendMessage("AI", "Error connecting to server.");
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
