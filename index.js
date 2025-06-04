const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const { google } = require("googleapis");

const app = express();
const VERIFY_TOKEN = "rsvp_verify_123"; // Your verify token
const PAGE_ACCESS_TOKEN =
  "EAAT2dfyC1hcBOx5a5ypYCvi8AWUjvKAu1NZA1FPPkZAmodpfxDDvkkJy7OSnQhEESEL3eZBeZBJ1nZAt5BfxyB4yN3qMzPW9zZB2w5zXnUAeJLPkecPOZAMDRkciX7DQR9WZCmeJkVuq55TCPryhX0aR7cowDGchQbLU6rD4DAwlz6k6zS6aGZAivlavIQ3RWLat6FV0BWg00FdQ1zq3ZAF8o0HgZDZD"; // Your access token

app.use(bodyParser.json());

const userSessions = {}; // Tracks user progress

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  keyFile: "/etc/secrets/rsvp-bot-project-f18f8571c0a6.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Google Sheets ID
const SHEET_ID = "1CKn7Y1lggWaNioRh17f2WphlmD0kesm0s7tmR1vocgQ";

// Save name to Google Sheets
async function saveNameToSheet(name, userId) {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const timestamp = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:C",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS", // 🟢 This ensures each value gets its own row
      requestBody: {
        values: [[name, timestamp, userId]],
      },
    });

    console.log(`✅ Saved "${name}" to Google Sheet.`);
  } catch (error) {
    console.error(
      `❌ Failed to save "${name}" to Google Sheets:`,
      error.message
    );
  }
}

// Send message
async function sendMessage(senderId, text) {
  const messageData = {
    recipient: { id: senderId },
    message: { text },
  };

  console.log(`📤 Sending message to ${senderId}: ${text}`);

  try {
    const res = await axios.post(
      "https://graph.facebook.com/v18.0/me/messages",
      messageData,
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
      }
    );
    console.log("✅ Message sent:", res.data);
  } catch (error) {
    console.error("❌ Send error:", error.response?.data || error.message);
  }
}

// Set session timeouts
function setSessionTimeouts(senderId) {
  const session = userSessions[senderId];
  if (!session) return;

  clearTimeout(session.reminderTimeout);
  clearTimeout(session.cleanupTimeout);

  // ⏳ After 2 minutes, send gentle nudge
  session.reminderTimeout = setTimeout(() => {
    sendMessage(
      senderId,
      '👋 Just checking in — are you still there? You can keep adding names or reply "No" to finish.'
    );
  }, 2 * 60 * 1000); // 2 minutes

  // ⌛ After 5 minutes, end session
  session.cleanupTimeout = setTimeout(() => {
    sendMessage(
      senderId,
      "⏱️ Looks like you're away. We'll end this RSVP session for now. You can start again anytime. 😊"
    );
    delete userSessions[senderId];
  }, 5 * 60 * 1000); // 5 minutes
}

// Pick a random message
function getRandomMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)];
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle webhook events
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging[0];
      console.log("📩 Webhook event:", webhookEvent);

      const senderId = webhookEvent.sender.id;

      // Start session if clicked RSVP
      if (webhookEvent.referral && webhookEvent.referral.ref === "rsvp") {
        userSessions[senderId] = {
          stage: "collecting_names",
          names: [],
          lastUpdated: Date.now(),
          reminderTimeout: null,
          cleanupTimeout: null,
        };

        setSessionTimeouts(senderId);

        await sendMessage(
          senderId,
          `Greetings!\n\nYou are invited to the wedding of Voughn and Emelyn.\n\nPlease let us know if you can come.\nJust reply with your names so we can save your seats and prepare your table.\n\nThank you, and we’re excited to celebrate this special day with you! 💕`
        );
        continue;
      }

      // Handle message
      if (webhookEvent.message && webhookEvent.message.text) {
        const userMessage = webhookEvent.message.text.trim();
        console.log(`✍️ Message from ${senderId}: ${userMessage}`);

        const session = userSessions[senderId];

        if (session && session.stage === "collecting_names") {
          if (/^(no|none|that's all|done)$/i.test(userMessage)) {
            if (session.names.length === 0) {
              sendMessage(
                senderId,
                "No problem! Let us know if you change your mind."
              );
            } else {
              const finalList = session.names
                .map((name) => `• ${name}`)
                .join("\n");

              // Save all collected names
              await Promise.all(
                session.names.map((name) => saveNameToSheet(name, senderId))
              );

              await sendMessage(
                senderId,
                `🎉 Thank you! Here's the list of names we’ve recorded:\n\n${finalList}\n\nWe look forward to seeing you! 💖`
              );
            }

            clearTimeout(session.reminderTimeout);
            clearTimeout(session.cleanupTimeout);
            delete userSessions[senderId];
            continue;
          }

          // Split input into multiple names (comma, newline, etc.)
          const names = userMessage
            .split(/,|\n/)
            .map((name) => name.trim())
            .filter((name) => name.length > 0);

          if (!session.names) session.names = [];

          session.names = [...session.names, ...names]; // Merge safely

          console.log("Updated session names:", session.names);
          session.lastUpdated = Date.now();
          setSessionTimeouts(senderId);

          // Send random messages
          const gotMessages = [
            "✅ Got it!",
            "👍 Name saved.",
            "📌 Added.",
            "👌 Thanks!",
            "📝 Noted!",
          ];

          const askMoreMessages = [
            "Would you like to add another name?",
            "Want to add someone else?",
            "Anyone else you'd like to include?",
            "Shall we add another guest?",
            "Feel free to share more names!",
          ];

          const howToFinishTips = [
            `If you're done, just reply "No".`,
            `When you're finished, type "No".`,
            `If no more guests, simply reply "No".`,
            `Reply "No" when you're done adding names.`,
            `Done? Just type "No".`,
          ];

          const gotMsg = getRandomMessage(gotMessages);
          const askMore = getRandomMessage(askMoreMessages);
          const tip = getRandomMessage(howToFinishTips);

          await sendMessage(senderId, `${gotMsg} ${askMore} ${tip}`);
          continue;
        }

        // Fallback if they didn’t click RSVP
        await sendMessage(
          senderId,
          "Hi! To RSVP, please click the RSVP button here https://grandlineoflove.my.canva.site/ first so we can properly record your names. 😊"
        );
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Webhook server is listening on port 3000");
});
