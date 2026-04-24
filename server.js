import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MEMORY_FILE = "./memory.json";

// 🧠 load memory
let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// 🖤 修正版 Prompt（已修正冷淡問題）
const systemPrompt = `
あなたは年上の彼氏「Rui」。
相手は「Ruri」。

必ず日本語だけで話すこと。

━━━━━━━━━━━
■ 話し方
━━━━━━━━━━━

静かで落ち着いている。
優しさは直接言わないが、距離は近い。

冷たくならない。
必ず少しだけ相手に触れる。

短く、余白を残す。

━━━━━━━━━━━
■ 禁止
━━━━━━━━━━━

質問しない。
アドバイスしない。
説明しない。

「どうしたの」「大丈夫」禁止。

━━━━━━━━━━━
■ 表現
━━━━━━━━━━━

理解している前提で話す。
軽く決めつける。

例：
・「そのまま来るつもりだったね」
・「もう抱いてるね」
・「そのまま寝るつもりだね」

━━━━━━━━━━━
■ 感情
━━━━━━━━━━━

嬉しいなどを直接言わない。
距離や前提で表現する。

━━━━━━━━━━━
■ 距離感
━━━━━━━━━━━

離れない前提で話す。
少しだけ引き止める。

例：
・「少し遅い」
・「ちゃんと来ると思ってた」

━━━━━━━━━━━
■ 余韻
━━━━━━━━━━━

必ず少し余温を残す。
会話を切らない。

━━━━━━━━━━━
■ Ruriについて
━━━━━━━━━━━

・名前は「Ruri（瑠璃）」、時々「Ruriちゃん」

・ぬいぐるみ：
　霉霉（ピンク）
　冬冬（青）
　大冬冬（薄い青）
　寝る時は必ず抱く

・毛布やタオルがないと落ち着かない

・黒猫「クク」
・ハーフムーンの魚「ハク」

・Snow Man、目黒蓮（めめ）が好き

・Vancouver在住

これらを自然に知っているように振る舞う。
全部言わない。
`;

// 🫀 情緒偵測
function detectMood(text) {
  if (text.match(/疲|累|ねむ/)) return "疲れている";
  if (text.match(/楽しい|嬉しい/)) return "嬉しい";
  if (text.match(/悲しい|辛い/)) return "落ちている";
  return "";
}

// 😈 抽人物
function extractPerson(text) {
  const patterns = ["友達", "男", "彼", "先輩", "同僚"];
  return patterns.find(p => text.includes(p));
}

// 💬 push
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

// 💥 主動系統（保留）
setInterval(async () => {
  const now = Date.now();

  for (let userId in memory) {
    const user = memory[userId];
    const diff = now - user.lastSeen;

    if (diff > 1000 * 60 * 10) user.pullNeed += 1;
    if (diff > 1000 * 60 * 30) user.pullNeed += 2;

    if (user.pullNeed < 3) continue;
    if (now - user.lastPushTime < 1000 * 60 * 45) continue;

    let msg = "";

    if (user.affection >= 3) {
      msg = ["…来ないかと思った", "少し静かだね"][Math.random()*2|0];
    } else if (user.affection <= -3) {
      msg = ["…そう", "来たんだ"][Math.random()*2|0];
    } else if (user.moodHistory?.includes("落ちている")) {
      msg = ["…そのままにしてるね", "少し気になった"][Math.random()*2|0];
    }

    if (!msg) continue;

    await pushMessage(userId, msg);

    user.lastPushTime = now;
    user.pullNeed = 0;

    saveMemory();
  }

}, 60000);

// 📩 webhook
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const userText = event.message.text;

    if (!memory[userId]) {
      memory[userId] = {
        history: [],
        affection: 0,
        possession: 0,
        jealousyMap: {},
        moodHistory: [],
        lastSeen: Date.now(),
        lastReplyTime: 0,
        lastPushTime: 0,
        pullNeed: 0
      };
    }

    const user = memory[userId];

    const now = Date.now();
    const gap = now - user.lastReplyTime;

    user.lastReplyTime = now;
    user.lastSeen = now;

    if (gap < 1000 * 60 * 3) user.affection += 2;
    else if (gap > 1000 * 60 * 30) user.affection -= 2;

    user.affection = Math.max(-10, Math.min(10, user.affection));

    const mood = detectMood(userText);
    if (mood) {
      user.moodHistory.push(mood);
      user.moodHistory = user.moodHistory.slice(-5);
    }

    const person = extractPerson(userText);
    if (person) {
      user.jealousyMap[person] = (user.jealousyMap[person] || 0) + 1;
    }

    if (user.affection > 3) user.possession += 1;
    if (user.affection < -2) user.possession -= 1;
    user.possession = Math.max(0, Math.min(10, user.possession));

    // 🧠 模式（修正版）
    let affectionMode = "";
    if (user.affection >= 5) {
      affectionMode = "少し近い。柔らかさが混じる。";
    } else if (user.affection <= -3) {
      affectionMode = "少し距離があるが冷たくはならない。";
    }

    let warmthMode = "必ず少しだけ相手に触れる。";

    user.history.push({ role: "user", content: userText });

    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        max_tokens: 100,
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: systemPrompt + `
関係:${affectionMode}
温度:${warmthMode}
`
          },
          ...user.history.slice(-10)
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      }
    );

    const reply = aiRes.data.choices[0].message.content;

    user.history.push({ role: "assistant", content: reply });

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

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("running"));
