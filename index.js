const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const VERIFY_TOKEN = "rsvp_verify_123"; // Your verify token
const PAGE_ACCESS_TOKEN =
  "EAAT2dfyC1hcBOx5a5ypYCvi8AWUjvKAu1NZA1FPPkZAmodpfxDDvkkJy7OSnQhEESEL3eZBeZBJ1nZAt5BfxyB4yN3qMzPW9zZB2w5zXnUAeJLPkecPOZAMDRkciX7DQR9WZCmeJkVuq55TCPryhX0aR7cowDGchQbLU6rD4DAwlz6k6zS6aGZAivlavIQ3RWLat6FV0BWg00FdQ1zq3ZAF8o0HgZDZD"; // Your access token

app.use(bodyParser.json());

const userSessions = {}; // Tracks user progress

// Helper: send message using axios
async function sendMessage(senderId, text) {
  const messageData = {
    recipient: { id: senderId },
    message: { text },
  };

  console.log(`Sending message to ${senderId}: ${text}`);

  try {
    const res = await axios.post(
      "https://graph.facebook.com/v18.0/me/messages",
      messageData,
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
      }
    );
    console.log("Message sent successfully:", res.data);
  } catch (error) {
    console.error(
      "Unable to send message:",
      error.response?.data || error.message
    );
  }
}

// Helper: pick a random message
function getRandomMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)];
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming webhook events
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach((entry) => {
      const webhookEvent = entry.messaging[0];
      console.log("Webhook event:", webhookEvent);

      const senderId = webhookEvent.sender.id;

      // Handle RSVP referral
      if (webhookEvent.referral && webhookEvent.referral.ref === "rsvp") {
        console.log(`Referral from user ${senderId}: RSVP clicked`);

        userSessions[senderId] = {
          stage: "collecting_names",
          names: [],
        };

        sendMessage(
          senderId,
          `Greetings!\n\nYou are invited to the wedding of Voughn and Emelyn.\n\nPlease let us know if you can come.\nJust reply with your names so we can save your seats and prepare your table.\n\nThank you, and we’re excited to celebrate this special day with you! 💕`
        );
        return;
      }

      // Handle user messages
      if (webhookEvent.message && webhookEvent.message.text) {
        const userMessage = webhookEvent.message.text.trim();
        console.log(`Message from user ${senderId}: ${userMessage}`);

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
              sendMessage(
                senderId,
                `🎉 Thank you! Here's the list of names we’ve recorded:\n\n${finalList}\n\nWe look forward to seeing you! 💖`
              );
            }

            delete userSessions[senderId];
            return;
          }

          //session.names.push(userMessage);

          const names = userMessage
            .split(/\n|,/)
            .map((name) => name.trim())
            .filter((name) => name.length > 0);

          session.names.push(...names);

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

          sendMessage(senderId, `${gotMsg} ${askMore} ${tip}`);
          return;
        }

        // Default fallback if user didn’t click RSVP link
        sendMessage(
          senderId,
          "Hi! To RSVP, please click the RSVP button on our website first so we can properly record your names. 😊"
        );
      }
    });

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// Start webhook server
app.listen(3000, () => {
  console.log("Webhook server is listening on port 3000");
});
