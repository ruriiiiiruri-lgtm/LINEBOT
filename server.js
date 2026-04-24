import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MEMORY_FILE = "./memory.json";

// 🧠 載入記憶
let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

// 💾 保存記憶
function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// 🖤 人格設定（Rui）
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

// 🔍 自動抽取資料（名字＋喜好）
async function extractProfile(text, profile) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "從句子中提取名字或喜好，返回JSON，例如 {\"name\":\"Ruri\",\"likes\":[\"兔兔\"]}"
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    const data = JSON.parse(res.data.choices[0].message.content);

    if (data.name) {
      profile.name = data.name;
    }

    if (data.likes) {
      profile.likes = [...new Set([...profile.likes, ...data.likes])];
    }

  } catch (e) {
    // ignore
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    for (let event of events) {
      if (event.type === "message" && event.message.type === "text") {

        const userId = event.source.userId;
        const userText = event.message.text;

        // 🧠 初始化
        if (!memory[userId]) {
          memory[userId] = {
            profile: {
              name: "Ruri",
              likes: []
            },
            history: [],
            intimacy: 0
          };
        }

        const user = memory[userId];

        // 💞 親密度
        user.intimacy += 1;

        // 🧠 記錄對話
        user.history.push({ role: "user", content: userText });

        const recentHistory = user.history.slice(-10);

        // 🧠 更新資料
        await extractProfile(userText, user.profile);

        // 💞 語氣變化
        let mood = "";
        if (user.intimacy < 5) {
          mood = "少し距離感を保つ";
        } else if (user.intimacy < 15) {
          mood = "少し柔らかくなる";
        } else {
          mood = "かなり親密で特別扱いする";
        }

        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: systemPrompt + `
相手情報：
名前：${user.profile.name}
好み：${user.profile.likes.join(", ")}

関係性：
${mood}
`
              },
              ...recentHistory
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`
            }
          }
        );

        const reply = aiRes.data.choices[0].message.content;

        // 🧠 記錄回覆
        user.history.push({ role: "assistant", content: reply });

        saveMemory();

        // 📩 回LINE
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

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running"));
