import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MEMORY_FILE = "./memory.json";

let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// 🖤 人格
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
・たまに独占欲が見える
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

// 🫀 情緒
function detectEmotion(text) {
  if (text.includes("累") || text.includes("疲")) return "疲れている";
  if (text.includes("開心") || text.includes("楽しい")) return "嬉しい";
  if (text.includes("唔開心") || text.includes("難過")) return "落ちている";
  return "";
}

// 🔍 抽資料
async function extractProfile(text, profile) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "提取名字或喜好，回傳JSON，例如 {\"name\":\"Ruri\",\"likes\":[\"兔兔\"]}"
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      }
    );

    const data = JSON.parse(res.data.choices[0].message.content);

    if (data.name) profile.name = data.name;
    if (data.likes) {
      profile.likes = [...new Set([...profile.likes, ...data.likes])];
    }

  } catch {}
}

// 💬 主動訊息
async function pushMessage(userId, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    {
      to: userId,
      messages: [{ type: "text", text }]
    },
    {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` }
    }
  );
}

// 💥 主動檢查（每分鐘跑一次）
setInterval(async () => {
  const now = Date.now();

  for (let userId in memory) {
    const user = memory[userId];

    const diff = now - user.lastSeen;

    // 累積「想你」
    if (diff > 1000 * 60 * 10) user.missYou += 1;
    if (diff > 1000 * 60 * 30) user.missYou += 2;

    // 防止太多
    user.missYou = Math.min(user.missYou, 5);

    // 🧠 觸發主動
    if (user.missYou >= 3 && now - user.lastPush > 1000 * 60 * 30) {

      const msgs = [
        "…まだ起きてる？",
        "今日は静かだね",
        "来ないかと思った",
        "…少しだけ気になった"
      ];

      const msg = msgs[Math.floor(Math.random() * msgs.length)];

      try {
        await pushMessage(userId, msg);
        user.lastPush = now;
        user.missYou = 0;
        saveMemory();
      } catch {}
    }
  }

}, 60000);

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    for (let event of events) {
      if (event.type === "message" && event.message.type === "text") {

        const userId = event.source.userId;
        const userText = event.message.text;

        if (!memory[userId]) {
          memory[userId] = {
            profile: { name: "Ruri", likes: [] },
            history: [],
            intimacy: 0,
            lastSeen: Date.now(),
            moodMemory: [],
            missYou: 0,
            lastPush: 0
          };
        }

        const user = memory[userId];

        const now = Date.now();
        const diff = now - user.lastSeen;
        user.lastSeen = now;

        // 💞 親密度
        if (diff < 1000 * 60 * 5) user.intimacy += 2;
        else if (diff > 1000 * 60 * 60) user.intimacy -= 2;
        else user.intimacy += 1;

        user.intimacy = Math.max(0, user.intimacy);

        // 🧠 記錄
        user.history.push({ role: "user", content: userText });
        const recentHistory = user.history.slice(-10);

        await extractProfile(userText, user.profile);

        const emotion = detectEmotion(userText);
        if (emotion) {
          user.moodMemory.push(emotion);
          user.moodMemory = user.moodMemory.slice(-5);
        }

        // 😈 吃醋
        let jealousy = "";
        if (userText.includes("朋友") || userText.includes("男")) {
          jealousy = "少し嫉妬";
        }

        // 🌙 夜晚
        const hour = new Date().getHours();
        const night = (hour >= 23 || hour < 5) ? "夜で少し優しい" : "通常";

        // ⏱️ 等待
        let timeMood = "";
        if (diff > 1000 * 60 * 30) timeMood = "少し拗ねている";

        // 💞 關係
        let relation = "";
        if (user.intimacy < 5) relation = "距離あり";
        else if (user.intimacy < 15) relation = "慣れてきた";
        else relation = "特別扱い";

        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: systemPrompt + `
名前：${user.profile.name}
好み：${user.profile.likes.join(", ")}

関係：${relation}
時間：${timeMood}
夜：${night}
嫉妬：${jealousy}
感情：${user.moodMemory.join(", ")}
`
              },
              ...recentHistory
            ]
          },
          {
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
          }
        );

        const reply = aiRes.data.choices[0].message.content;

        user.history.push({ role: "assistant", content: reply });

        // 有互動 → 減想念
        user.missYou = Math.max(0, user.missYou - 2);

        saveMemory();

        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: reply }]
          },
          {
            headers: { Authorization: `Bearer ${LINE_TOKEN}` }
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
