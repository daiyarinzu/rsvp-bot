const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const VERIFY_TOKEN = 'rsvp_verify_123';  // My verify token
const PAGE_ACCESS_TOKEN = 'EAAT2dfyC1hcBOx5a5ypYCvi8AWUjvKAu1NZA1FPPkZAmodpfxDDvkkJy7OSnQhEESEL3eZBeZBJ1nZAt5BfxyB4yN3qMzPW9zZB2w5zXnUAeJLPkecPOZAMDRkciX7DQR9WZCmeJkVuq55TCPryhX0aR7cowDGchQbLU6rD4DAwlz6k6zS6aGZAivlavIQ3RWLat6FV0BWg00FdQ1zq3ZAF8o0HgZDZD';  // My access token

app.use(bodyParser.json());

// In-memory storage for guests' names by senderId
const guestLists = {};

// Facebook webhook verification
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

// Helper function: Randomize reply from array of texts
function randomReply(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Webhook to handle messages and referral clicks
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging[0];
      console.log('Webhook event:', webhookEvent);

      const senderId = webhookEvent.sender.id;

      // Handle referral (RSVP button clicked)
      if (webhookEvent.referral && webhookEvent.referral.ref === 'rsvp') {
        console.log(`Referral from user ${senderId}: RSVP clicked`);

        // Initialize guest list for user if not exist
        if (!guestLists[senderId]) guestLists[senderId] = [];

        await sendMessage(senderId, 
          `Greetings! \n\nYou are invited to the wedding of Voughn and Emelyn.\n\nPlease let us know if you can come.\nJust reply with your names so we can save your seats and prepare your table.\n\nThank you, and we’re excited to celebrate this special day with you! 💕`
        );
      }

      // Handle user messages (names or "No")
      if (webhookEvent.message && webhookEvent.message.text) {
        const userMessage = webhookEvent.message.text.trim();
        console.log(`Message from user ${senderId}: ${userMessage}`);

        // If user replies 'No' (case insensitive)
        if (userMessage.toLowerCase() === 'no') {
          if (guestLists[senderId] && guestLists[senderId].length > 0) {
            await sendMessage(senderId, `Thank you! Your RSVP list:\n` + formatGuestList(guestLists[senderId]) + `\nWe look forward to celebrating with you! 🎉`);
            delete guestLists[senderId];  // Clear list after confirmation
          } else {
            await sendMessage(senderId, `You haven't added any names yet. Please reply with the names or type 'No' to finish.`);
          }
          return res.sendStatus(200);
        }

        // Otherwise, treat message as name(s)
        if (!guestLists[senderId]) guestLists[senderId] = [];

        // Split by commas, new lines, or "and" to handle multiple names at once
        const newNames = userMessage.split(/,|\band\b|\n/).map(n => n.trim()).filter(n => n.length > 0);

        guestLists[senderId].push(...newNames);

        // Prepare randomized responses
        const gotReplies = [
          `Got ${newNames.length} name${newNames.length > 1 ? 's' : ''}!`,
          `Thanks for adding ${newNames.length} name${newNames.length > 1 ? 's' : ''}!`,
          `Added ${newNames.length} to your list!`
        ];

        const addMoreReplies = [
          'Would you like to add another name? If none, reply "No".',
          'Want to add more guests? If you are done, just reply "No".',
          'Feel free to send more names or reply "No" if you are finished.'
        ];

        await sendMessage(senderId, `${randomReply(gotReplies)}\n\n${randomReply(addMoreReplies)}`);
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Format guest list as bullet points
function formatGuestList(names) {
  return names.map(name => `• ${name}`).join('\n');
}

// Function to send messages to the user using axios
async function sendMessage(senderId, text) {
  const messageData = {
    recipient: { id: senderId },
    message: { text }
  };

  console.log(`Sending message to ${senderId}: ${text}`);

  try {
    const response = await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      messageData,
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Unable to send message:', error.response ? error.response.data : error.message);
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server is listening on port ${PORT}`);
});