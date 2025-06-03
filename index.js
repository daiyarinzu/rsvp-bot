const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const VERIFY_TOKEN = 'rsvp_verify_123';  // My verify token
const PAGE_ACCESS_TOKEN = 'EAAT2dfyC1hcBOx5a5ypYCvi8AWUjvKAu1NZA1FPPkZAmodpfxDDvkkJy7OSnQhEESEL3eZBeZBJ1nZAt5BfxyB4yN3qMzPW9zZB2w5zXnUAeJLPkecPOZAMDRkciX7DQR9WZCmeJkVuq55TCPryhX0aR7cowDGchQbLU6rD4DAwlz6k6zS6aGZAivlavIQ3RWLat6FV0BWg00FdQ1zq3ZAF8o0HgZDZD';  // My access token

app.use(bodyParser.json());

const userStates = {}; // Store each user's guest list

// Random message templates
const gotMessages = [
  "✅ Got it!",
  "👍 Name saved.",
  "📌 Added.",
  "👌 Thanks!",
  "📝 Noted!"
];

const askMoreMessages = [
  "Would you like to add another name?",
  "Want to add someone else?",
  "Anyone else you'd like to include?",
  "Shall we add another guest?",
  "Feel free to share more names!"
];

const howToFinishTips = [
  `If you're done, just reply "No".`,
  `When you're finished, type "No".`,
  `If no more guests, simply reply "No".`,
  `Reply "No" when you're done adding names.`,
  `Done? Just type "No".`
];

// Verify webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming messages and referrals
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging[0];
      console.log('Webhook event:', webhookEvent);

      const senderId = webhookEvent.sender.id;

      // Handle referral
      if (webhookEvent.referral && webhookEvent.referral.ref === 'rsvp') {
        console.log(`Referral from user ${senderId}: RSVP clicked`);

        userStates[senderId] = { names: [] };

        await sendMessage(senderId,
          `Greetings!\n\nYou are invited to the wedding of Voughn and Emelyn.\n\nPlease let us know if you can come.\nJust reply with your names so we can save your seats and prepare your table.\n\nThank you, and we’re excited to celebrate this special day with you! 💕`
        );
        continue;
      }

      // Handle user reply
      if (webhookEvent.message && webhookEvent.message.text) {
        const userMessage = webhookEvent.message.text.trim();
        const lower = userMessage.toLowerCase();

        if (!userStates[senderId]) {
          userStates[senderId] = { names: [] };
        }

        if (lower === 'no') {
          const nameList = userStates[senderId].names;
          if (nameList.length === 0) {
            await sendMessage(senderId, "Alright! No names were added.");
          } else {
            const bulletList = nameList.map(name => `• ${name}`).join('\n');
            await sendMessage(senderId,
              `🎉 Thank you! We’ve saved the following name(s):\n\n${bulletList}\n\nWe look forward to seeing you! 💖`
            );
          }
          delete userStates[senderId]; // Clear state after finishing
          continue;
        }

        // Save name and reply
        userStates[senderId].names.push(userMessage);

        const gotMsg = gotMessages[Math.floor(Math.random() * gotMessages.length)];
        const askMsg = askMoreMessages[Math.floor(Math.random() * askMoreMessages.length)];
        const tipMsg = howToFinishTips[Math.floor(Math.random() * howToFinishTips.length)];

        await sendMessage(senderId, `${gotMsg}\n${askMsg}\n${tipMsg}`);
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Send message using axios
async function sendMessage(senderId, text) {
  const messageData = {
    recipient: { id: senderId },
    message: { text }
  };

  console.log(`Sending message to ${senderId}: ${text}`);

  try {
    const res = await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      messageData,
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    console.log('Message sent successfully:', res.data);
  } catch (err) {
    console.error('Unable to send message:', err.response?.data || err.message);
  }
}

// Start server
app.listen(3000, () => {
  console.log('Webhook server is listening on port 3000');
});