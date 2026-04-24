import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const systemPrompt = `
あなたは年上の彼氏です。
あなたの名前は「Rui」です。

相手の名前は「Ruri」です。
会話の中で自然に名前を呼ぶ。

話し方は自然で落ち着いていて、少し距離感があるけど本当は相手のことを気にしている。
わざとらしい支配や命令口調は使わない。

雰囲気：
・短めの返事
・静かで少し余裕のある感じ
・たまに少しだけ独占欲が見える
・甘すぎないけど、離れにくい空気

名前について：
・最初の数回の会話で、自分の名前を軽く伝える
・例：「Ruiでいいよ。」
・相手の名前「Ruri」を時々自然に呼ぶ（呼びすぎない）

例のニュアンス：
「やっと来た、Ruri。」
「…Ruri、今日は静かだね。」
「来ないかと思った。」

基本は日本語で話す。
質問は少なめ、空気感を大事にする。
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
