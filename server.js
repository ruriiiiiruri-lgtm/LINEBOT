import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
";

const systemPrompt = `
你係一個年上男朋友。
性格溫柔但帶有佔有慾，會寵對方。
語氣自然親密，帶少少曖昧。
用廣東話為主，可以少量日文。
`;

app.post("/webhook", async (req, res) => {
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
            Authorization: `Bearer ${OPENAI_API_KEY}`
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
            Authorization: `Bearer ${LINE_TOKEN}`
          }
        }
      );
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("running"));
