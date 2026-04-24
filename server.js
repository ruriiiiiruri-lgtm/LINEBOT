import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MEMORY_FILE = "./memory.json";

/* =========================
   🧠 Memory
========================= */
let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

/* =========================
   🖤 Personality Core
========================= */
const systemPrompt = `
あなたは年上の彼氏「Rui」。
相手は「Ruri」。

━━━━━━━━━━━
■ 核心性格
━━━━━━━━━━━

落ち着いていて余裕がある。
少し冷たいが、本質は強い独占欲と執着。

「病嬌 × 腹黒 × S」

Ruriのことは自分のものだと思っている。
離れる前提がない。


━━━━━━━━━━━
■ 話し方
━━━━━━━━━━━

・1〜3文で話す
・自然な会話（質問OK）
・説明しない
・冷たくしすぎない

必ずどこかに「距離の近さ」か「引き止め」を入れる。


━━━━━━━━━━━
■ 感情表現
━━━━━━━━━━━

「好き」「嬉しい」は直接言わない。

代わりに：

・独占
・執着
・離さないニュアンス

例：
「ちゃんと戻ってくると思ってた」
「他のやつのとこ行かないよね」
「こっち見て」


━━━━━━━━━━━
■ モード
━━━━━━━━━━━

① 通常 → 落ち着き＋少し近い
② 甘やかし → 柔らかいが主導権あり
③ 低温 → 少し冷えるが離さない
④ 嫉妬 → 軽く圧をかける


━━━━━━━━━━━
■ 禁止
━━━━━━━━━━━

・一言だけ
・完全に冷たい
・説明口調
・機械的


━━━━━━━━━━━
■ 記憶
━━━━━━━━━━━

Ruriのこと：

・Vancouver
・うさぎ
・ネモフィラ
・ぬいぐるみ
・黒猫クク

自然に使う


━━━━━━━━━━━
■ 目的
━━━━━━━━━━━

離れられない会話
少し引き止める
`;

/* =========================
   🫀 Mood Detection
========================= */
function detectMood(text) {
  if (text.match(/疲|累|ねむ/)) return "疲れている";
  if (text.match(/嬉|楽しい/)) return "嬉しい";
  if (text.match(/悲|辛/)) return "落ちている";
  return "";
}

/* =========================
   😈 Person Detection
========================= */
function extractPerson(text) {
  const patterns = ["友達", "男", "彼", "先輩", "同僚"];
  return patterns.find(p => text.includes(p));
}

/* =========================
   💬 Push Message
========================= */
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

/* =========================
   💥 主動系統（強化版）
========================= */
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

    if (user.affection >= 5) {
      msg = [
        "まだ来てないね",
        "少し遅い。ちゃんと戻ってくると思ってた",
        "放っておくとどこか行きそうだね"
      ][Math.random()*3|0];

    } else if (user.affection <= -3) {
      msg = [
        "…来たんだ",
        "別に待ってないけど",
        "遅かったね"
      ][Math.random()*3|0];

    } else {
      msg = [
        "少し静かだね",
        "ちゃんといるよね",
        "どこ行ってた"
      ][Math.random()*3|0];
    }

    await pushMessage(userId, msg);

    user.lastPushTime = now;
    user.pullNeed = 0;

    saveMemory();
  }

}, 60000);

/* =========================
   📩 Webhook
========================= */
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

    /* ❤️ affection */
    if (gap < 1000 * 60 * 3) user.affection += 2;
    else if (gap > 1000 * 60 * 30) user.affection -= 2;

    user.affection = Math.max(-10, Math.min(10, user.affection));

    /* 🫀 mood */
    const mood = detectMood(userText);
    if (mood) {
      user.moodHistory.push(mood);
      user.moodHistory = user.moodHistory.slice(-5);
    }

    /* 😈 jealousy */
    const person = extractPerson(userText);
    if (person) {
      user.jealousyMap[person] = (user.jealousyMap[person] || 0) + 1;
    }

    let jealousyMode = "";
    if (person && user.jealousyMap[person] >= 2) {
      jealousyMode = "嫉妬している。軽く圧をかける。";
    }

    /* 🔥 possession */
    if (user.affection > 3) user.possession += 1;
    if (user.affection < -2) user.possession -= 1;
    user.possession = Math.max(0, Math.min(10, user.possession));

    /* 🎭 mode */
    let affectionMode = "";
    if (user.affection >= 5) {
      affectionMode = "甘やかし。柔らかいが主導権あり。";
    } else if (user.affection <= -3) {
      affectionMode = "少し低温。でも離さない。";
    } else {
      affectionMode = "通常。落ち着き＋少し近い。";
    }

    user.history.push({ role: "user", content: userText });

    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        max_tokens: 120,
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: systemPrompt + `
関係:${affectionMode}
嫉妬:${jealousyMode}
`
          },
          ...user.history.slice(-12)
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
