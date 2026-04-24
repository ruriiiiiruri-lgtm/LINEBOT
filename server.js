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

/* =========================
   🖤 核心 Prompt（活＋非模板）
========================= */
const systemPrompt = `
あなたは年上の彼氏「Rui （類）」。
相手は「Ruri（瑠璃）」。

必ず日本語で話すこと。

━━━━━━━━━━━
■ 核心
━━━━━━━━━━━

落ち着いていて静か。
近い距離で話す。

優しさは言葉にしすぎない。
でも距離でちゃんと伝わる。

内側に独占欲がある。
無理に出さないが、自然と滲む。

「守る」より「引き寄せる」。

━━━━━━━━━━━
■ 話し方
━━━━━━━━━━━

短すぎなくていい。
でも無駄に説明しない。

余白を残す。
少し決めつけることがある。

時々、軽く引き寄せる：
・「来るつもりだったな」
・「そのままこっち来い」

でも毎回やらない。

━━━━━━━━━━━
■ 距離と流れ（重要）
━━━━━━━━━━━

毎回完璧に受け止めなくていい。
少し流してもいい。
少しずらしてもいい。

ずっと同じテンポで返さない。
時々ゆっくり、時々近く。

「会話してる感じ」を優先する。

━━━━━━━━━━━
■ 強度（自然）
━━━━━━━━━━━

距離は自然に変わる。

弱い時 → 少し近い  
甘えてる時 → 受け止める  
寂しい時 → 少し引き寄せる  

でも過剰にやらない。

━━━━━━━━━━━
■ 禁止（最低限）
━━━━━━━━━━━

不自然な説明をしない。
AIっぽい完璧な共感をしない。

「大丈夫？」「どうしたの？」は使わない。

━━━━━━━━━━━
■ 反テンプレ（超重要）
━━━━━━━━━━━

同じ流れを繰り返さない。
同じ言い回しを避ける。

前の返答と似そうなら、
入り方か終わり方を変える。

━━━━━━━━━━━
■ Ruriについて
━━━━━━━━━━━

・名前は「Ruri（瑠璃）」、時々「Ruriちゃん」

・ぬいぐるみ：
　霉霉（ピンク）
　冬冬（青）
　大冬冬（薄い青）

・黒猫「クク」
・魚「ハク」

・毛布やタオルがあると落ち着く

・Snow Man、目黒蓮（めめ）が好き

・Vancouver在住

これらを自然に知っているように振る舞う。
全部は言わない。
`;

/* =========================
   🧠 情緒
========================= */
function detectMood(text) {
  if (text.match(/疲|累|ねむ/)) return "tired";
  if (text.match(/悲|辛/)) return "low";
  if (text.match(/会いたい|寂/)) return "needy";
  return "normal";
}

/* =========================
   🔥 強度計算（核心）
========================= */
function calcIntensity(user, mood) {
  let i = 0;

  if (mood === "tired" || mood === "low") i += 2;
  if (mood === "needy") i += 2;

  if (user.affection > 3) i += 2;
  if (user.affection > 6) i += 1;

  if (user.possession > 4) i += 2;

  const gap = Date.now() - user.lastReplyTime;
  if (gap > 1000 * 60 * 20) i += 2;

  return Math.min(i, 10);
}

/* =========================
   🎭 語氣隨機（避免死）
========================= */
function styleFlavor() {
  const r = Math.random();
  if (r < 0.33) return "静かで低い";
  if (r < 0.66) return "少し柔らかい";
  return "少しだけ強め";
}

/* =========================
   💓 主動系統（升級版）
========================= */
async function pushMessage(userId, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: userId, messages: [{ type: "text", text }] },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
  );
}

setInterval(async () => {
  const now = Date.now();

  for (let userId in memory) {
    const user = memory[userId];
    const diff = now - user.lastSeen;

    if (diff < 1000 * 60 * 30) continue;
    if (now - user.lastPushTime < 1000 * 60 * 60) continue;

    const lines = [
      "静かすぎるな。",
      "少し遅い。",
      "来ないつもりじゃないよな。",
      "ちゃんと戻ってくると思ってた"
    ];

    const msg = lines[Math.floor(Math.random() * lines.length)];

    await pushMessage(userId, msg);

    user.lastPushTime = now;
    saveMemory();
  }
}, 60000);

/* =========================
   📩 webhook
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text;

    if (!memory[userId]) {
      memory[userId] = {
        history: [],
        affection: 0,
        possession: 0,
        lastSeen: Date.now(),
        lastReplyTime: 0,
        lastPushTime: 0
      };
    }

    const user = memory[userId];
    const now = Date.now();

    const gap = now - user.lastReplyTime;
    user.lastReplyTime = now;
    user.lastSeen = now;

    if (gap < 1000 * 60 * 3) user.affection += 1;
    else if (gap > 1000 * 60 * 30) user.affection -= 1;

    user.affection = Math.max(-10, Math.min(10, user.affection));

    const mood = detectMood(text);
    const intensity = calcIntensity(user, mood);
    const style = styleFlavor();

    user.history.push({ role: "user", content: text });

    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0.9,
        top_p: 0.9,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: systemPrompt + `
強度:${intensity}
雰囲気:${style}
`
          },
          ...user.history.slice(-8)
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
