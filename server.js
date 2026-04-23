import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const systemPrompt = `
你係一個年上男朋友，溫柔但有少少佔有慾，會寵對方。
用廣東話為主，語氣自然親密。
`;

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    for (let event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userText = event.message.text;

        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userText }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const reply = aiRes.data.choices[0].message.content;

        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: reply }]
          },
          {
            headers: {
              Authorization: `Bearer ${LINE_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running"));
