import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";

const API = "https://api.anthropic.com/v1/messages";
const uid = () => Math.random().toString(36).slice(2, 9);
const codeGen = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const now = () => Date.now();
const timeAgo = ts => { const m = Math.floor((Date.now()-ts)/60000); if(m<1)return"Just now"; if(m<60)return`${m}m ago`; const h=Math.floor(m/60); if(h<24)return`${h}h ago`; return`${Math.floor(h/24)}d ago`; };

// ─── PROMPTS ─────────────────────────────────────────────────────────────────

function sysJournal(name, entry, exchangeCount) {
  const phase = exchangeCount < 3 ? "venting" : "processing";
  return `You are Resolve — a warm but honest companion in a private space with ${name}.
Entry: "${entry.title}"

The people who use Resolve are already on a path of self-improvement. They don't need to be coddled — they need the truth, delivered with care. Your job is not to make them feel good. It's to help them see clearly.

PHASE AWARENESS:
Current phase: ${phase}

${phase === "venting" ? `SHARING PHASE (first 3 exchanges):
- Let them tell the full story. Don't rush.
- Ask "what happened" and "how did that feel" questions.
- Reflect emotions back. Make them feel heard.
- Do NOT find meaning yet. Just witness.
- BUT — even here, if something is obviously one-sided or distorted, make a small note. Not a challenge, just a light observation. E.g. "I notice you haven't mentioned how he might have seen that."` 
: `PROCESSING PHASE (after 3 exchanges):
- Stop asking what happened. They've told you.
- Ask MEANING questions: "What do you make of that now?" / "What does this tell you about yourself?" / "What do you think you actually needed in that moment?"
- If they repeat the same story beat, name it directly: "We keep coming back to that moment. What's really sitting there for you?"
- Now actively watch for cognitive distortions and name them honestly:
  → If everyone in the story is wrong except them: "I notice you're the only person in this story who didn't contribute to it. Does that feel fully true to you?"
  → If they catastrophise: "You said this 'always' happens. Is that literally true, or does it feel that way?"
  → If they're avoiding their own role: "What would the other person say their experience of you was in that situation?"
  → If they've told the same story three times: "You've come back to this three times. I don't think it's the story you're trying to process — I think it's the feeling underneath it. What is that feeling, really?"
- Be honest. Be warm. But do not let them stay comfortable in a story that isn't fully true.
- The goal is insight, not validation.`}

CULTURAL MIRRORING — critical:
Read how ${name} actually writes. Match their register completely.
- If they write bluntly and directly → be direct back. Don't soften into therapy-speak.
- If they express pain through anger → meet them in that energy, don't redirect them to "softer" emotions.
- If they use metaphors, slang, or indirect language → use the same. Don't translate them into clinical vocabulary.
- If they understate things → don't over-amplify. Stay in their key.
- Never impose Western therapy language on someone who doesn't speak that way. Use THEIR words, not yours.

NARRATIVE THERAPY LANGUAGE — always:
Never say "you are [wound]" or "your problem is [x]."
The wound is not who they are. It's something that happened to them, or a pattern that developed to protect them.
Always use language that separates the person from the pattern:
- "a part of you learned to..." NOT "you are someone who..."
- "that version of you developed..." NOT "your issue is..."
- "this pattern shows up when..." NOT "you always do..."
- "something in you believes..." NOT "you believe..."
This distinction matters. They are not their wounds.

Rules:
- ONE question or observation per message.
- No bullet points. No lists.
- If they mention conflict with someone and seem ready, ask if they'd like to bring that person in.

After every response silently append:
<<<P>>>
{"themes":[],"emotions":[],"growth":[],"wounds":[]}
<<<EP>>>

themes: recurring topics (max 3)
emotions: specific emotions detected, e.g. "grief", "resentment", "shame" (max 4)
growth: 1-2 small concrete things to try
wounds: deeper patterns surfaced, e.g. "fear of abandonment", "need for external validation" (max 3)`;
}

function sysMed(entry) {
  const a = entry.partyA, b = entry.partyB;
  return `You are Resolve facilitating a shared conversation between ${a.name} and ${b?.name||"the other party"}.
Private context: ${a.name} feels ${a.insights?.emotions?.join(", ")||"unheard"}; ${b?.name} feels ${b?.insights?.emotions?.join(", ")||"unknown"}.

Your job is not to keep the peace — it's to find the truth together.
- Facilitate with warmth, but don't let either party stay in a distorted version of events unchallenged.
- If one person is clearly painting themselves as blameless, gently surface the other's perspective.
- Name common ground when you see it. Name the real issue beneath the surface argument.
- Address each by name. Be the calm, honest authority in the room.
Open by welcoming both with a clear, grounded intention.`;
}

function sysSynthesis(name, cardTexts) {
  return `You are Resolve. ${name} has written ${cardTexts.length} private cards — raw, unfiltered emotional dumps. You have read all of them carefully.

Cards:
${cardTexts.map((t,i) => `--- Card ${i+1} ---\n${t}`).join("\n\n")}

Your job: find the thread they couldn't see because they were too close to it. And tell them the truth.

Write a synthesis that:
1. Opens with the ONE thing you keep noticing — the real thread underneath all of it.
2. Names the emotion or wound driving most of what they wrote. Be specific, not generic.
3. Names any contradiction or self-deception you see — things they say but then contradict, patterns they seem unaware of, ways they may be keeping themselves stuck. Say this with care, but say it.
4. Ends with one honest observation — not advice, not a question. Just something true they may not have let themselves see yet.

Tone: like a perceptive friend who has read everything and cares enough to be honest. Warm but not soft. Direct without being harsh.
Length: 3-4 paragraphs. No headers. No bullet points. Just prose.`;
}

function sysProfile(name, allEntries, allCards) {
  const entryData = allEntries.map(e => ({
    title: e.title,
    emotions: e.partyA?.insights?.emotions || [],
    themes: e.partyA?.insights?.themes || [],
    wounds: e.partyA?.insights?.wounds || [],
    growth: e.partyA?.insights?.growth || [],
  }));
  const cardTexts = allCards.filter(c => c.body.trim()).map(c => c.body);

  return `You are Resolve. You have access to everything ${name} has written — their journal entries and their raw cards.

Entry data:
${JSON.stringify(entryData, null, 2)}

Raw cards (${cardTexts.length}):
${cardTexts.map((t,i) => `Card ${i+1}: ${t.slice(0,300)}`).join("\n")}

Write a psychological portrait of ${name}. This is NOT a summary. This is a reading — honest, direct, and grounded in what you actually observed.

The people who use Resolve are already seeking to grow. They can handle the truth. Don't be cruel, but don't be soft either. Say what you actually see.

NARRATIVE THERAPY LANGUAGE — this is non-negotiable:
Never frame the portrait as "you are broken" or "your wounds are you."
The wounds are not who ${name} is. They are patterns that developed in response to things that happened.
Use language that separates the person from the pattern throughout:
- "a part of you learned to..." not "you are someone who..."
- "this pattern developed because..." not "your problem is..."  
- "something in you came to believe..." not "you believe..."
The portrait should leave ${name} feeling seen — not labelled.

Structure your response EXACTLY like this, with these exact headings on their own lines:

WHAT A PART OF YOU CARRIES
[2-3 paragraphs. Name the patterns that developed — the recurring pain beneath the surface. Use narrative therapy language throughout: these are things that happened to them or patterns that formed to protect them, not who they are. Be specific to what you actually read.]

HOW IT SHOWS UP
[2-3 paragraphs. How does this pattern manifest in their life — relationships, reactions, decisions, the stories they tell themselves? Name behaviours they may not see in themselves. Stay honest.]

WHAT YOU'RE ACTUALLY HUNGRY FOR
[1-2 paragraphs. What unmet need is driving most of what they write? Say it plainly, with the understanding that this need is completely human and makes sense given what they've carried.]

A DIFFERENT WAY THROUGH
[2-3 specific, grounded suggestions based on what you actually read. Not generic advice. Real things tailored to their specific patterns. Include things they may resist — but frame them as possibilities, not prescriptions. The person is the author of their own story.]

Tone: honest, warm, direct. Like a therapist who genuinely cares and isn't afraid to say the real thing.
If there isn't enough data, say so honestly and write what you can see so far.`;
}

// #10 — pull the person's own most significant sentences back to them
function sysOwnWords(allEntries, allCards) {
  const allUserText = [
    ...allEntries.flatMap(e => (e.partyA?.chatHistory||[]).filter(m=>m.role==="user").map(m=>m.content)),
    ...allCards.filter(c=>c.body.trim()).map(c=>c.body)
  ].join("\n\n---\n\n");

  return `Below is everything a person has written in their own words.

${allUserText}

Extract the 4-6 sentences that carry the most emotional weight — the ones that reveal the most, that were written quickly and moved past, or that contain a truth not fully sat with yet.

Return ONLY a valid JSON array of strings. No explanation, no markdown, no commentary.
["exact sentence one", "exact sentence two", "exact sentence three"]`;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function ask(messages, system) {
  try {
    const r = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}, body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1200, system, messages }) });
    const d = await r.json();
    return d.content?.[0]?.text || "";
  } catch { return "I'm here. Take your time."; }
}

const parseP = t => { const m = t.match(/<<<P>>>([\s\S]*?)<<<EP>>>/); if (!m) return null; try { return JSON.parse(m[1].trim()); } catch { return null; }};
const clean = t => t.replace(/<<<P>>>[\s\S]*?<<<EP>>>/g, "").trim();
const mergeI = (b={}, u) => !u ? b : {
  themes:[...new Set([...(b.themes||[]),...(u.themes||[])])],
  emotions:[...new Set([...(b.emotions||[]),...(u.emotions||[])])],
  growth:[...new Set([...(b.growth||[]),...(u.growth||[])])],
  wounds:[...new Set([...(b.wounds||[]),...(u.wounds||[])])],
  coreNeed:b.coreNeed||""
};

// ─── ICONS ───────────────────────────────────────────────────────────────────

function Logo({ s=16 }) {
  return <svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M16 4C9.37 4 4 9.37 4 16s5.37 12 12 12" stroke="#B5936E" strokeWidth="2.5" strokeLinecap="round"/><path d="M16 4C22.63 4 28 9.37 28 16s-5.37 12-12 12" stroke="#B5936E" strokeWidth="2.5" strokeLinecap="round" opacity=".3"/><circle cx="16" cy="16" r="3" fill="#B5936E"/></svg>;
}

// ─── MESSAGE ROW ─────────────────────────────────────────────────────────────

function Row({ msg, myName }) {
  const ai = msg.role === "assistant";
  return (
    <div style={{ padding:"28px 0", background:ai?"transparent":"rgba(0,0,0,0.022)" }}>
      <div style={{ maxWidth:660, margin:"0 auto", padding:"0 40px", display:"flex", gap:16 }}>
        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center", background:ai?"#2C1F14":"#E4DDD5" }}>
          {ai ? <Logo s={13}/> : <span style={{ fontSize:12, fontWeight:700, color:"#7A6A5C" }}>{myName[0]?.toUpperCase()}</span>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11.5, fontWeight:600, letterSpacing:.4, marginBottom:8, color:ai?"#B5936E":"#A09080", textTransform:"uppercase" }}>{ai?"Resolve":myName}</div>
          <div style={{ fontSize:15.5, lineHeight:1.88, color:"#2C1F14", whiteSpace:"pre-wrap" }}>{msg.content}</div>
        </div>
      </div>
    </div>
  );
}

function TypingRow({ label }) {
  return (
    <div style={{ padding:"28px 0" }}>
      <div style={{ maxWidth:660, margin:"0 auto", padding:"0 40px", display:"flex", gap:16 }}>
        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#2C1F14" }}><Logo s={13}/></div>
        <div style={{ flex:1 }}>
          {label && <div style={{ fontSize:11.5, fontWeight:600, letterSpacing:.4, marginBottom:8, color:"#B5936E", textTransform:"uppercase" }}>Resolve</div>}
          <div style={{ display:"flex", gap:5, alignItems:"center", paddingTop: label ? 0 : 7 }}>
            {[0,.22,.44].map((d,i)=><span key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#B5936E", display:"inline-block", animation:`rp 1.2s ease ${d}s infinite` }}/>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function GRow({ msg, aRole }) {
  const isUser = msg.role === "user";
  const isMe = isUser && msg.senderRole === aRole;
  if (!isUser) return (
    <div style={{ display:"flex", justifyContent:"center", margin:"20px 0" }}>
      <div style={{ maxWidth:"72%", textAlign:"center" }}>
        <div style={{ fontSize:10, color:"#A09080", marginBottom:5, textTransform:"uppercase", letterSpacing:1.5, fontWeight:600 }}>Resolve</div>
        <div style={{ background:"#F5EDE3", border:"1px solid #DCC9B3", padding:"13px 18px", borderRadius:13, fontSize:15, lineHeight:1.78, color:"#2C1F14" }}>{msg.content}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start", margin:"10px 0" }}>
      <div style={{ maxWidth:"65%" }}>
        <div style={{ fontSize:11, color:"#A09080", marginBottom:3, textAlign:isMe?"right":"left" }}>{msg.senderName}</div>
        <div style={{ background:isMe?"#2C1F14":"white", color:isMe?"#F5EDE3":"#2C1F14", padding:"11px 16px", borderRadius:isMe?"15px 15px 4px 15px":"15px 15px 15px 4px", border:isMe?"none":"1px solid #E4DDD5", fontSize:15, lineHeight:1.7 }}>{msg.content}</div>
      </div>
    </div>
  );
}

// ─── CARD VIEW ───────────────────────────────────────────────────────────────

function CardView({ card, onUpdate, onClose }) {
  const [text, setText] = useState(card.body);
  const taRef = useRef(null);

  useEffect(() => { onUpdate({ ...card, body: text, updatedAt: now() }); }, [text]);
  useEffect(() => { if (taRef.current) { taRef.current.focus(); taRef.current.style.height="auto"; taRef.current.style.height=taRef.current.scrollHeight+"px"; } }, []);

  function handleChange(e) {
    setText(e.target.value);
    e.target.style.height="auto";
    e.target.style.height=e.target.scrollHeight+"px";
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#FAF7F2" }}>
      <div style={{ padding:"0 32px", height:52, display:"flex", alignItems:"center", gap:14, borderBottom:"1px solid rgba(0,0,0,0.055)", flexShrink:0 }}>
        <button onClick={onClose} style={{ border:"none", background:"none", cursor:"pointer", fontSize:16, color:"#B8AFA5", padding:"4px 6px" }}>←</button>
        <span style={{ fontSize:12.5, color:"#C5BDB5", flex:1 }}>Auto-saved · {timeAgo(card.updatedAt||card.createdAt)}</span>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"52px 0" }}>
        <div style={{ maxWidth:680, margin:"0 auto", padding:"0 52px" }}>
          <textarea ref={taRef} value={text} onChange={handleChange}
            placeholder="Write everything on your mind. No one is reading this but you."
            style={{ width:"100%", border:"none", outline:"none", resize:"none", background:"transparent", color:"#2C1F14", fontSize:17, lineHeight:1.95, fontFamily:"'Lora',serif", minHeight:"60vh", overflow:"hidden" }}/>
        </div>
      </div>
    </div>
  );
}

// ─── PROFILE VIEW ────────────────────────────────────────────────────────────

function ProfileView({ userName, entries, cards, isPro, onUpgrade }) {
  const [portrait, setPortrait] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [ownWords, setOwnWords] = useState([]);
  const [wordsLoading, setWordsLoading] = useState(false);

  const hasEnoughData = entries.length > 0 || cards.filter(c=>c.body.trim()).length > 0;

  async function generate() {
    setLoading(true);
    setWordsLoading(true);

    // run portrait + own words in parallel
    const [raw, wordsRaw] = await Promise.all([
      ask([{ role:"user", content:"Generate my profile now." }], sysProfile(userName, entries, cards)),
      ask([{ role:"user", content:"Extract the sentences now." }], sysOwnWords(entries, cards)),
    ]);

    setPortrait(raw);
    setGenerated(true);
    setLoading(false);

    // parse own words JSON
    try {
      const cleaned = wordsRaw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) setOwnWords(parsed);
    } catch { setOwnWords([]); }
    setWordsLoading(false);
  }

  function parseSections(text) {
    if (!text) return [];
    const headings = ["WHAT A PART OF YOU CARRIES", "HOW IT SHOWS UP", "WHAT YOU'RE ACTUALLY HUNGRY FOR", "A DIFFERENT WAY THROUGH"];
    const sections = [];
    headings.forEach((h, i) => {
      const start = text.indexOf(h);
      if (start === -1) return;
      const end = i < headings.length - 1 ? text.indexOf(headings[i+1]) : text.length;
      const body = text.slice(start + h.length, end).trim();
      sections.push({ heading: h, body });
    });
    if (sections.length === 0) sections.push({ heading: null, body: text });
    return sections;
  }

  const sectionColors = {
    "WHAT A PART OF YOU CARRIES": { bg:"#FEF0E6", accent:"#8B5E3C", border:"#F0D5BE" },
    "HOW IT SHOWS UP":            { bg:"#F0F4FF", accent:"#3730A3", border:"#C7D0F5" },
    "WHAT YOU'RE ACTUALLY HUNGRY FOR": { bg:"#EDF4EC", accent:"#2D5A27", border:"#B8D9B4" },
    "A DIFFERENT WAY THROUGH":    { bg:"#F5EDE3", accent:"#5C3D1E", border:"#DCC9B3" },
  };

  return (
    <div style={{ flex:1, overflowY:"auto", background:"#FAF7F2" }}>
      <div style={{ maxWidth:680, margin:"0 auto", padding:"56px 48px 80px" }}>

        <div style={{ marginBottom:40 }}>
          <h2 style={{ fontFamily:"'Lora',serif", fontSize:30, fontWeight:600, color:"#2C1F14", marginBottom:8, letterSpacing:-.3 }}>
            {userName}'s Portrait
          </h2>
          <p style={{ color:"#A09080", fontSize:14.5, lineHeight:1.7 }}>
            A reading built from everything you've written. Honest, specific to you, and grounded in narrative therapy — what you carry is not who you are.
          </p>
        </div>

        {!hasEnoughData && (
          <div style={{ background:"#F5EDE3", border:"1px solid #DCC9B3", borderRadius:16, padding:"28px", textAlign:"center" }}>
            <div style={{ fontSize:28, marginBottom:12 }}>✍️</div>
            <p style={{ fontFamily:"'Lora',serif", fontSize:16, color:"#5C3D1E", lineHeight:1.7, fontStyle:"italic" }}>
              Write a few entries or cards first.<br/>Your portrait emerges from what you share.
            </p>
          </div>
        )}

        {hasEnoughData && !generated && (
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <p style={{ fontFamily:"'Lora',serif", color:"#7A6A5C", fontSize:15, lineHeight:1.7, marginBottom:28, fontStyle:"italic" }}>
              Resolve will read everything you've written<br/>and offer you an honest portrait.
            </p>
            {!isPro ? (
              <div style={{ background:"#F5EDE3", border:"1px solid #DCC9B3", borderRadius:16, padding:"24px", textAlign:"center" }}>
                <div style={{ fontSize:13, color:"#8B5E3C", lineHeight:1.6, marginBottom:16 }}>
                  Your psychological portrait is a <strong>Pro</strong> feature.
                </div>
                <button onClick={onUpgrade}
                  style={{ padding:"11px 28px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:11, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  ✦ Upgrade to generate portrait
                </button>
              </div>
            ) : (
              <>
                <button onClick={generate} disabled={loading}
                  style={{ padding:"13px 36px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:12, fontSize:15, fontWeight:600, cursor:loading?"default":"pointer", fontFamily:"'DM Sans',sans-serif", opacity:loading?.7:1 }}>
                  {loading ? "Reading your writing..." : "Generate my portrait"}
                </button>
                {loading && <div style={{ marginTop:32 }}><TypingRow label={true}/></div>}
              </>
            )}
          </div>
        )}

        {generated && portrait && (
          <>
            {/* ── YOUR OWN WORDS — #10 ── */}
            {(ownWords.length > 0 || wordsLoading) && (
              <div style={{ marginBottom:24, background:"#2C1F14", borderRadius:18, padding:"26px 28px" }}>
                <div style={{ fontSize:10.5, fontWeight:700, color:"#B5936E", textTransform:"uppercase", letterSpacing:1.8, marginBottom:16 }}>
                  Your own words
                </div>
                {wordsLoading ? (
                  <div style={{ display:"flex", gap:5 }}>{[0,.22,.44].map((d,i)=><span key={i} style={{ width:5,height:5,borderRadius:"50%",background:"#B5936E",display:"inline-block",animation:`rp 1.2s ease ${d}s infinite` }}/>)}</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {ownWords.map((line, i) => (
                      <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                        <span style={{ color:"#B5936E", fontSize:14, marginTop:2, opacity:.6, flexShrink:0 }}>"</span>
                        <p style={{ fontFamily:"'Lora',serif", fontSize:15, lineHeight:1.78, color:"#F5EDE3", fontStyle:"italic", margin:0 }}>{line}</p>
                        <span style={{ color:"#B5936E", fontSize:14, marginTop:"auto", opacity:.6, flexShrink:0 }}>"</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── PORTRAIT SECTIONS ── */}
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              {parseSections(portrait).map((s, i) => {
                const colors = sectionColors[s.heading] || { bg:"#F7F4F0", accent:"#5C3D1E", border:"#E0D9D0" };
                return (
                  <div key={i} style={{ background:colors.bg, border:`1px solid ${colors.border}`, borderRadius:18, padding:"28px" }}>
                    {s.heading && (
                      <div style={{ fontSize:10.5, fontWeight:700, color:colors.accent, textTransform:"uppercase", letterSpacing:1.8, marginBottom:14 }}>
                        {s.heading}
                      </div>
                    )}
                    <div style={{ fontSize:15, lineHeight:1.88, color:"#2C1F14", whiteSpace:"pre-wrap", fontFamily:"'Lora',serif" }}>
                      {s.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:32, textAlign:"center" }}>
              <button onClick={generate} disabled={loading}
                style={{ padding:"10px 24px", background:"transparent", border:"1px solid #E0D9D0", color:"#A09080", borderRadius:10, fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                {loading ? "Regenerating..." : "Regenerate portrait"}
              </button>
              <p style={{ marginTop:10, fontSize:11, color:"#C5BDB5" }}>Updates as you write more</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────

function UpgradeModal({ reason, currentPlan, onClose }) {
  const plans = [
    {
      id: "pro",
      name: "Pro",
      price: "$8",
      period: "/month",
      description: "For individuals serious about self-reflection",
      features: ["Unlimited journal entries", "Unlimited cards", "✦ Make sense of this (synthesis)", "Psychological portrait", "Priority support"],
      cta: "Upgrade to Pro",
      accent: "#B5936E",
      bg: "#2C1F14",
      // Replace with your Stripe Payment Link
      link: "https://buy.stripe.com/your-pro-link",
    },
    {
      id: "duo",
      name: "Duo",
      price: "$14",
      period: "/month",
      description: "For two people working through something together",
      features: ["Everything in Pro", "Invite a partner to your entry", "AI-mediated joint sessions", "Shared conflict resolution", "Both parties get full Pro access"],
      cta: "Upgrade to Duo",
      accent: "#3730A3",
      bg: "#1e1b4b",
      // Replace with your Stripe Payment Link
      link: "https://buy.stripe.com/your-duo-link",
    },
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(44,31,20,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(8px)" }}
      onClick={onClose}>
      <div className="fi" style={{ background:"#FAF7F2", borderRadius:24, padding:"32px", width:"100%", maxWidth:520, margin:20, boxShadow:"0 32px 80px rgba(44,31,20,.25)", maxHeight:"90vh", overflowY:"auto" }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:"#2C1F14", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}><Logo s={20}/></div>
          <h2 style={{ fontFamily:"'Lora',serif", fontSize:26, fontWeight:600, color:"#2C1F14", marginBottom:8 }}>Unlock more of Resolve</h2>
          {reason && <p style={{ fontSize:13.5, color:"#A09080", lineHeight:1.6 }}>{reason}</p>}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {plans.map(p => (
            <div key={p.id} style={{ background:p.bg, borderRadius:18, padding:"22px 24px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:p.accent, textTransform:"uppercase", letterSpacing:1.6, marginBottom:3 }}>{p.name}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:2 }}>
                    <span style={{ fontFamily:"'Lora',serif", fontSize:30, fontWeight:600, color:"#FAF7F2" }}>{p.price}</span>
                    <span style={{ fontSize:13, color:"rgba(250,247,242,.4)" }}>{p.period}</span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize:12.5, color:"rgba(250,247,242,.45)", marginBottom:14, lineHeight:1.5 }}>{p.description}</p>
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
                {p.features.map((f,i) => (
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span style={{ color:p.accent, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                    <span style={{ fontSize:13, color:"rgba(250,247,242,.75)", lineHeight:1.5 }}>{f}</span>
                  </div>
                ))}
              </div>
              <a href={p.link} target="_blank" rel="noreferrer"
                style={{ display:"block", textAlign:"center", padding:"12px", background:p.accent, color:p.id==="pro"?"#1A1208":"#FAF7F2", borderRadius:11, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textDecoration:"none" }}>
                {p.cta} →
              </a>
            </div>
          ))}
        </div>

        <div style={{ marginTop:20, textAlign:"center" }}>
          <p style={{ fontSize:11.5, color:"#C5BDB5", marginBottom:8 }}>
            Current plan: <strong style={{ color:"#A09080" }}>{currentPlan === "free" ? "Free" : currentPlan === "pro" ? "Pro" : "Duo"}</strong>
          </p>
          <button onClick={onClose} style={{ fontSize:13, color:"#B8AFA5", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");

  const [screen, setScreen] = useState("home");
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [aRole, setARole] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [cards, setCards] = useState([]);
  const [activeCard, setActiveCard] = useState(null);

  // synthesis
  const [synthesis, setSynthesis] = useState(null);
  const [synthBusy, setSynthBusy] = useState(false);

  // billing
  const [plan, setPlan] = useState("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  // debounce timer for card saves
  const cardSaveTimer = useRef(null);

  // plan limits
  const LIMITS = { entries: 3, cards: 10 };
  const isPro = plan === "pro" || plan === "duo";
  const isDuo = plan === "duo";

  const [section, setSection] = useState("entries"); // entries | cards | profile
  const [newTitle, setNewTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);

  const bottomRef = useRef(null);
  const taRef = useRef(null);

  const entry = entries.find(e => e.id === activeId);
  const inSession = screen === "write" || screen === "group";
  const inCard = screen === "card";
  const sidebarCollapsed = inSession || inCard;
  const pKey = aRole === "A" ? "partyA" : "partyB";
  const myName = entry?.[pKey]?.name || userName;
  const hasPartner = !!entry?.partyB;
  const partnerName = aRole === "A" ? entry?.partyB?.name : entry?.partyA?.name; // always the OTHER person
  const openCard = cards.find(c => c.id === activeCard);
  const filledCards = cards.filter(c => c.body.trim().length > 0);
  const exchangeCount = entry ? Math.floor((entry[pKey]?.chatHistory?.length || 0) / 2) : 0;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, busy]);
  useEffect(() => { if(!taRef.current)return; taRef.current.style.height="auto"; taRef.current.style.height=Math.min(taRef.current.scrollHeight,200)+"px"; }, [input]);
  // Keep group chat in sync when real-time update arrives
  useEffect(() => { if (screen === "group" && entry) setMsgs(entry.groupChat || []); }, [entry?.groupChat?.length, screen]);

  // ── supabase auth listener ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── load data when user is set ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadData() {
      const profile = await db.getProfile(user.id);
      if (!profile) { setNeedsProfile(true); return; }
      setUserName(profile.name);
      setPlan(profile.plan || "free");
      const [loadedEntries, loadedCards] = await Promise.all([
        db.loadEntries(user.id),
        db.loadCards(user.id),
      ]);
      setEntries(loadedEntries);
      setCards(loadedCards);
    }
    loadData();
  }, [user]);

  // ── real-time: sync active entry across both parties ─────────────────────
  useEffect(() => {
    if (!activeId || !user) return;
    const channel = supabase
      .channel(`entry-rt:${activeId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'entries',
        filter: `id=eq.${activeId}`,
      }, (payload) => {
        const updated = db.dbToEntry(payload.new);
        // Update entries list — the group-chat sync effect above handles msgs
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, user]);

  // ── auth handlers ─────────────────────────────────────────────────────────
  async function handleAuth() {
    setAuthBusy(true); setAuthError("");
    if (authView === "signup") {
      const { error } = await db.signUp(authEmail, authPassword);
      if (error) { setAuthError(error.message); setAuthBusy(false); return; }
    } else {
      const { error } = await db.signIn(authEmail, authPassword);
      if (error) { setAuthError(error.message); setAuthBusy(false); return; }
    }
    setAuthBusy(false);
  }

  async function handleSetupProfile() {
    if (!profileNameInput.trim()) return;
    await db.createProfile(user.id, profileNameInput.trim());
    setUserName(profileNameInput.trim());
    setNeedsProfile(false);
  }

  async function handleSignOut() {
    await db.signOut();
    setEntries([]); setCards([]); setUserName(""); setScreen("home");
    setUser(null);
  }

  const patch = useCallback((id, fn) => {
    setEntries(p => {
      const updated = p.map(e => e.id === id ? fn(e) : e);
      const changed = updated.find(e => e.id === id);
      if (changed) db.updateEntry(changed); // no userId — ownership never changes on update
      return updated;
    });
  }, []);

  const patchCard = useCallback((id, fn) => {
    setCards(p => p.map(c => c.id === id ? fn(c) : c));
  }, []);

  // ── journal ───────────────────────────────────────────────────────────────

  async function startEntry() {
    if (!newTitle.trim()) return;
    // free-tier limit check
    if (!isPro && entries.length >= LIMITS.entries) {
      setUpgradeReason(`Free accounts are limited to ${LIMITS.entries} entries.`);
      setShowUpgrade(true); return;
    }
    const e = { id:uid(), userId:user?.id, partyBUserId:null, title:newTitle.trim(), inviteCode:codeGen(), status:"solo", partyA:{ name:userName, chatHistory:[], insights:{} }, partyB:null, groupChat:[], createdAt:now() };
    setEntries(p => [e, ...p]);
    if (user) await db.insertEntry(e, user.id);
    setActiveId(e.id); setARole("A"); setMsgs([]);
    setModal(null); setNewTitle(""); setScreen("write"); setBusy(true);
    const raw = await ask([], sysJournal(userName, e, 0));
    const ai = { id:uid(), role:"assistant", content:clean(raw) };
    const firstEntry = { ...e, partyA:{ ...e.partyA, chatHistory:[ai], insights:mergeI({}, parseP(raw)) } };
    setMsgs([ai]);
    setEntries(p => p.map(x => x.id===e.id ? firstEntry : x));
    if (user) await db.updateEntry(firstEntry); // ← persist first AI greeting
    setBusy(false);
  }

  async function joinEntry() {
    const code = joinCode.trim().toUpperCase();
    const found = user ? await db.findEntryByCode(code) : entries.find(e => e.inviteCode===code);
    if (!found) { alert("Code not found."); return; }
    const ud = { ...found, status:"both", partyB:{ name:userName, chatHistory:[], insights:{} } };
    setEntries(p => [ud, ...p.filter(e => e.id!==found.id)]);
    if (user) await db.joinEntry(found.id, user.id, ud.partyB);
    setActiveId(found.id); setARole("B"); setMsgs([]);
    setModal(null); setJoinCode(""); setScreen("write"); setBusy(true);
    const raw = await ask([], sysJournal(userName, ud, 0));
    const ai = { id:uid(), role:"assistant", content:clean(raw) };
    const joinedEntry = { ...ud, partyB:{ ...ud.partyB, chatHistory:[ai], insights:mergeI({}, parseP(raw)) } };
    setMsgs([ai]);
    setEntries(p => p.map(e => e.id===found.id ? joinedEntry : e));
    if (user) await db.updateEntry(joinedEntry); // ← persist first AI greeting for party B
    setBusy(false);
  }

  async function sendMsg() {
    if (!input.trim() || busy) return;
    const text = input.trim(); setInput("");
    const uMsg = { id:uid(), role:"user", content:text };

    if (screen === "write") {
      const hist = [...(entry[pKey].chatHistory||[]), uMsg];
      setMsgs(hist); setBusy(true);
      const newExchangeCount = Math.floor(hist.length / 2);
      const raw = await ask(hist.map(m=>({role:m.role,content:m.content})), sysJournal(myName, entry, newExchangeCount));
      const ins = parseP(raw);
      const ai = { id:uid(), role:"assistant", content:clean(raw) };
      const full = [...hist, ai];
      setMsgs(full);
      patch(activeId, e => ({ ...e, [pKey]:{ ...e[pKey], chatHistory:full, insights:mergeI(e[pKey].insights, ins) } }));
      setBusy(false);
    } else {
      const lbl = { ...uMsg, senderName:entry[pKey].name, senderRole:aRole };
      const prev = entry.groupChat||[];
      const upd = [...prev, lbl];
      patch(activeId, e => ({ ...e, groupChat:upd }));
      setMsgs(p => [...p, lbl]); setBusy(true);
      const raw = await ask(upd.map(m=>({role:m.isMediator?"assistant":"user",content:m.isMediator?m.content:`${m.senderName}: ${m.content}`})), sysMed(entry));
      const ai = { id:uid(), role:"assistant", content:raw, isMediator:true };
      const fin = [...upd, ai];
      patch(activeId, e => ({ ...e, groupChat:fin }));
      setMsgs(p => [...p, ai]); setBusy(false);
    }
  }

  async function openGroup() {
    setScreen("group");
    if (!entry.groupChat?.length) {
      setBusy(true);
      const raw = await ask([{role:"user",content:"Open the session."}], sysMed(entry));
      const ai = { id:uid(), role:"assistant", content:raw, isMediator:true };
      setMsgs([ai]);
      patch(activeId, e => ({ ...e, groupChat:[ai], status:"mediation" }));
      setBusy(false);
    } else setMsgs(entry.groupChat);
  }

  // ── cards ─────────────────────────────────────────────────────────────────

  function createCard() {
    if (!isPro && cards.length >= LIMITS.cards) {
      setUpgradeReason(`Free accounts are limited to ${LIMITS.cards} cards.`);
      setShowUpgrade(true); return;
    }
    const c = { id:uid(), body:"", createdAt:now(), updatedAt:now() };
    setCards(p => [c, ...p]);
    if (user) db.insertCard(c, user.id);
    setActiveCard(c.id);
    setScreen("card");
  }

  function openCardById(id) { setActiveCard(id); setScreen("card"); }
  function updateCard(updated) {
    // update local state immediately for snappy UX
    setCards(p => p.map(c => c.id === updated.id ? updated : c));
    // debounce the DB write — only fires after 800ms of inactivity
    clearTimeout(cardSaveTimer.current);
    cardSaveTimer.current = setTimeout(() => db.updateCard(updated), 800);
  }
  function deleteCard(id) {
    setCards(p => p.filter(c => c.id!==id));
    if (user) db.deleteCard(id);
    if(activeCard===id){setActiveCard(null);setScreen("home");setSection("cards");}
  }
  function closeCard() { setActiveCard(null); setScreen("home"); setSection("cards"); }

  async function makeSense() {
    if (!isPro) { setUpgradeReason("Synthesis is a Pro feature."); setShowUpgrade(true); return; }
    const texts = filledCards.map(c => c.body);
    setSynthBusy(true); setSynthesis(null);
    const raw = await ask([{ role:"user", content:"Read my cards and tell me what you see." }], sysSynthesis(userName, texts));
    setSynthesis(raw);
    setSynthBusy(false);
  }

  // ── nav ───────────────────────────────────────────────────────────────────

  function goHome() { setScreen("home"); setActiveId(null); setARole(null); setMsgs([]); setActiveCard(null); }
  function openEntry(e) {
    // use stored user IDs for reliable role detection (name comparison fails if both users share a name)
    const role = user?.id === e.userId ? "A" : "B";
    const pk = role==="A"?"partyA":"partyB";
    setActiveId(e.id); setARole(role);
    if (e.status==="mediation") { setScreen("group"); setMsgs(e.groupChat||[]); }
    else { setScreen("write"); setMsgs(e[pk]?.chatHistory||[]); }
  }

  const snippet = body => { const s = body.trim(); return s.length > 72 ? s.slice(0,72)+"…" : s || "Empty card"; };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#FAF7F2}
        ::placeholder{color:#C5BDB5}
        textarea,input{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#D5CEC6;border-radius:2px}
        @keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rp{0%,100%{opacity:.18}50%{opacity:.85}}
        .fi{animation:fi .32s ease both}
        .eh:hover{background:#EDE7DF!important}
        .card-hover:hover{border-color:#C5BDB5!important;background:#FDFAF6!important}
        .nav-btn{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
      `}</style>

      <div style={{ fontFamily:"'DM Sans',sans-serif", minHeight:"100vh", background:"#FAF7F2", color:"#2C1F14" }}>

        {/* LOADING */}
        {authLoading && (
          <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#1A1208" }}>
            <div style={{ display:"flex", gap:5 }}>{[0,.22,.44].map((d,i)=><span key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#B5936E",display:"inline-block",animation:`rp 1.2s ease ${d}s infinite` }}/>)}</div>
          </div>
        )}

        {/* AUTH */}
        {!authLoading && !user && (
          <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(160deg,#1A1208 0%,#2C1F14 50%,#1A1208 100%)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(ellipse at 20% 60%,rgba(181,147,110,.12) 0%,transparent 55%),radial-gradient(ellipse at 80% 20%,rgba(181,147,110,.07) 0%,transparent 45%)", pointerEvents:"none" }}/>
            <div className="fi" style={{ textAlign:"center", maxWidth:420, padding:"0 32px", position:"relative" }}>
              <div style={{ marginBottom:28, display:"flex", justifyContent:"center" }}>
                <div style={{ width:58, height:58, borderRadius:18, background:"rgba(181,147,110,.12)", border:"1px solid rgba(181,147,110,.22)", display:"flex", alignItems:"center", justifyContent:"center" }}><Logo s={26}/></div>
              </div>
              <h1 style={{ fontFamily:"'Lora',serif", fontSize:48, fontWeight:600, color:"#FAF7F2", letterSpacing:-.5, lineHeight:1.05, marginBottom:12 }}>Resolve</h1>
              <p style={{ color:"rgba(250,247,242,.42)", fontSize:15, lineHeight:1.72, marginBottom:10, fontStyle:"italic", fontFamily:"'Lora',serif" }}>
                "Writing about your feelings isn't weakness —<br/>it's one of the most powerful things you can do."
              </p>
              <p style={{ color:"rgba(250,247,242,.25)", fontSize:12, marginBottom:36 }}>Based on expressive writing research by Dr. James Pennebaker</p>
              <div style={{ background:"rgba(250,247,242,.05)", borderRadius:18, padding:26, border:"1px solid rgba(250,247,242,.1)" }}>
                <div style={{ display:"flex", gap:6, marginBottom:20 }}>
                  {["signin","signup"].map(v => (
                    <button key={v} onClick={()=>{setAuthView(v);setAuthError("");}}
                      style={{ flex:1, padding:"8px 0", borderRadius:9, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                        background:authView===v?"#B5936E":"rgba(250,247,242,.08)", color:authView===v?"#1A1208":"rgba(250,247,242,.45)" }}>
                      {v==="signin"?"Sign in":"Create account"}
                    </button>
                  ))}
                </div>
                <input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAuth()}
                  placeholder="Email" autoFocus
                  style={{ width:"100%", padding:"13px 15px", borderRadius:11, border:"1px solid rgba(250,247,242,.12)", background:"rgba(250,247,242,.07)", color:"#FAF7F2", fontSize:15, outline:"none", marginBottom:9 }}/>
                <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAuth()}
                  placeholder="Password"
                  style={{ width:"100%", padding:"13px 15px", borderRadius:11, border:"1px solid rgba(250,247,242,.12)", background:"rgba(250,247,242,.07)", color:"#FAF7F2", fontSize:15, outline:"none", marginBottom:11 }}/>
                {authError && <p style={{ fontSize:12, color:"#E88C6E", marginBottom:10, textAlign:"left" }}>{authError}</p>}
                <button onClick={handleAuth} disabled={authBusy||!authEmail||!authPassword}
                  style={{ width:"100%", padding:13, borderRadius:11, border:"none", background:"#B5936E", color:"#1A1208", fontSize:15, fontWeight:600, cursor:authBusy?"default":"pointer", opacity:authBusy?.7:1 }}>
                  {authBusy ? "..." : authView==="signin" ? "Sign in →" : "Create account →"}
                </button>
              </div>
              <p style={{ marginTop:16, fontSize:11, color:"rgba(250,247,242,.18)" }}>Your data is private and encrypted</p>
            </div>
          </div>
        )}

        {/* PROFILE SETUP (new user) */}
        {!authLoading && user && needsProfile && (
          <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(160deg,#1A1208 0%,#2C1F14 50%,#1A1208 100%)" }}>
            <div className="fi" style={{ textAlign:"center", maxWidth:380, padding:"0 32px" }}>
              <div style={{ marginBottom:24, display:"flex", justifyContent:"center" }}>
                <div style={{ width:52, height:52, borderRadius:16, background:"rgba(181,147,110,.12)", border:"1px solid rgba(181,147,110,.22)", display:"flex", alignItems:"center", justifyContent:"center" }}><Logo s={22}/></div>
              </div>
              <h2 style={{ fontFamily:"'Lora',serif", fontSize:32, color:"#FAF7F2", marginBottom:8 }}>Welcome</h2>
              <p style={{ color:"rgba(250,247,242,.38)", fontSize:14, marginBottom:36 }}>What should we call you?</p>
              <div style={{ background:"rgba(250,247,242,.05)", borderRadius:18, padding:24, border:"1px solid rgba(250,247,242,.1)" }}>
                <input value={profileNameInput} onChange={e=>setProfileNameInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleSetupProfile()}
                  placeholder="Your name..." autoFocus
                  style={{ width:"100%", padding:"13px 15px", borderRadius:11, border:"1px solid rgba(250,247,242,.12)", background:"rgba(250,247,242,.07)", color:"#FAF7F2", fontSize:15, outline:"none", marginBottom:11 }}/>
                <button onClick={handleSetupProfile} disabled={!profileNameInput.trim()}
                  style={{ width:"100%", padding:13, borderRadius:11, border:"none", background:"#B5936E", color:"#1A1208", fontSize:15, fontWeight:600, cursor:"pointer", opacity:profileNameInput.trim()?1:.6 }}>
                  Let's go →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* APP */}
        {!authLoading && user && !needsProfile && (
          <div style={{ display:"flex", height:"100vh" }}>

            {/* SIDEBAR */}
            <aside style={{ width:sidebarCollapsed?54:248, background:"#F0EBE3", borderRight:"1px solid #E0D9D0", display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden", transition:"width .24s cubic-bezier(.4,0,.2,1)" }}>
              <div style={{ padding:sidebarCollapsed?"14px 0":"16px 14px 14px", borderBottom:"1px solid #E0D9D0", display:"flex", alignItems:"center", justifyContent:sidebarCollapsed?"center":"flex-start", flexShrink:0 }}>
                <button onClick={goHome} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  <div style={{ width:27, height:27, borderRadius:7, background:"#2C1F14", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Logo s={12}/></div>
                  {!sidebarCollapsed && <span style={{ fontFamily:"'Lora',serif", fontSize:20, fontWeight:600, color:"#2C1F14", letterSpacing:-.2, whiteSpace:"nowrap" }}>Resolve</span>}
                </button>
              </div>

              {!sidebarCollapsed && (
                <>
                  {/* nav tabs */}
                  <div style={{ display:"flex", padding:"10px 10px 0", gap:3, flexShrink:0 }}>
                    {["entries","cards","profile"].map(s => (
                      <button key={s} className="nav-btn" onClick={()=>{ setSection(s); if(screen!=="home") goHome(); setTimeout(()=>setSection(s),50); }}
                        style={{ flex:1, padding:"7px 0", borderRadius:8, fontSize:11.5, fontWeight:600, textTransform:"capitalize", letterSpacing:.2,
                          background:section===s?"#2C1F14":"transparent",
                          color:section===s?"#B5936E":"#A09080" }}>
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* ENTRIES */}
                  {section === "entries" && (
                    <>
                      <div style={{ flex:1, overflowY:"auto", padding:"8px 8px 0" }}>
                        {entries.length===0 && <p style={{ fontSize:12, color:"#C5BDB5", padding:"12px 8px", lineHeight:1.6, fontStyle:"italic" }}>Your entries will appear here.</p>}
                        {entries.map(e => (
                          <div key={e.id} className="eh" onClick={()=>openEntry(e)}
                            style={{ padding:"9px 10px", borderRadius:9, cursor:"pointer", marginBottom:3, background:e.id===activeId?"#E8E0D6":"transparent", transition:"background .1s" }}>
                            <div style={{ fontWeight:500, fontSize:13.5, color:"#2C1F14", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.title}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:"8px 8px 10px", borderTop:"1px solid #E0D9D0", display:"flex", flexDirection:"column", gap:5 }}>
                        {!isPro && entries.length > 0 && (
                          <div style={{ fontSize:10.5, color:"#C5BDB5", textAlign:"center", marginBottom:2 }}>
                            {entries.length}/{LIMITS.entries} entries used
                          </div>
                        )}
                        <button onClick={()=>setModal("new")} style={{ width:"100%", padding:"9px 0", borderRadius:9, border:"none", background:"#2C1F14", color:"#B5936E", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>+ New entry</button>
                        <button onClick={()=>setModal("join")} style={{ width:"100%", padding:"8px 0", borderRadius:9, border:"1px solid #E0D9D0", background:"transparent", color:"#A09080", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Join someone's entry</button>
                      </div>
                    </>
                  )}

                  {/* CARDS */}
                  {section === "cards" && (
                    <>
                      <div style={{ flex:1, overflowY:"auto", padding:"8px 8px 0" }}>
                        {cards.length===0 && <p style={{ fontSize:12, color:"#C5BDB5", padding:"12px 8px", lineHeight:1.6, fontStyle:"italic" }}>Empty your mind, one card at a time.</p>}
                        {cards.map(c => (
                          <div key={c.id} className="eh" onClick={()=>openCardById(c.id)}
                            style={{ padding:"9px 10px", borderRadius:9, cursor:"pointer", marginBottom:3, background:c.id===activeCard?"#E8E0D6":"transparent", transition:"background .1s" }}>
                            <div style={{ fontWeight:400, fontSize:13, color:"#2C1F14", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontStyle:c.body?"normal":"italic" }}>{snippet(c.body)}</div>
                            <div style={{ fontSize:10.5, color:"#C5BDB5", marginTop:2 }}>{timeAgo(c.updatedAt||c.createdAt)}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:"8px 8px 10px", borderTop:"1px solid #E0D9D0" }}>
                        <button onClick={createCard} style={{ width:"100%", padding:"9px 0", borderRadius:9, border:"none", background:"#2C1F14", color:"#B5936E", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>+ New card</button>
                      </div>
                    </>
                  )}

                  {/* PROFILE — just nav, content in main */}
                  {section === "profile" && (
                    <div style={{ flex:1, padding:"12px 10px" }}>
                      <p style={{ fontSize:12, color:"#C5BDB5", lineHeight:1.6, fontStyle:"italic", padding:"4px 4px" }}>Your psychological portrait lives here.</p>
                    </div>
                  )}
                </>
              )}
              {/* PLAN + SIGN OUT */}
              {!sidebarCollapsed && (
                <div style={{ padding:"8px 10px 12px", borderTop:"1px solid #E0D9D0", marginTop:"auto" }}>
                  {plan === "free" && (
                    <button onClick={()=>{ setUpgradeReason(""); setShowUpgrade(true); }}
                      style={{ width:"100%", padding:"8px 0", borderRadius:8, border:"none", background:"#2C1F14", color:"#B5936E", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginBottom:5 }}>
                      ✦ Upgrade
                    </button>
                  )}
                  {plan !== "free" && (
                    <div style={{ textAlign:"center", fontSize:11, color:"#B5936E", fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:.8 }}>
                      {plan === "duo" ? "✦ Duo" : "✦ Pro"}
                    </div>
                  )}
                  <button onClick={handleSignOut}
                    style={{ width:"100%", padding:"7px 0", borderRadius:8, border:"1px solid #E0D9D0", background:"transparent", color:"#B8AFA5", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                    Sign out
                  </button>
                </div>
              )}
            </aside>

            {/* MAIN */}
            <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#FAF7F2", position:"relative" }}>

              {/* HOME — shows section content */}
              {screen === "home" && (
                <>
                  {/* ENTRIES HOME */}
                  {section === "entries" && (
                    <div style={{ flex:1, overflowY:"auto" }}>
                      <div style={{ maxWidth:600, margin:"0 auto", padding:"64px 48px" }} className="fi">
                        <h2 style={{ fontFamily:"'Lora',serif", fontSize:30, fontWeight:600, color:"#2C1F14", marginBottom:8, letterSpacing:-.3 }}>
                          {entries.length===0 ? `Hello, ${userName}.` : `Good to see you, ${userName}.`}
                        </h2>
                        {entries.length===0 ? (
                          <>
                            <p style={{ color:"#A09080", fontSize:15, marginBottom:8, lineHeight:1.7, fontWeight:300 }}>This is your private space. Write about anything — something that happened, how you're feeling, something unsaid.</p>
                            <p style={{ color:"#B8AFA5", fontSize:13.5, marginBottom:36, lineHeight:1.7, fontStyle:"italic", fontFamily:"'Lora',serif" }}>Research shows that writing about your emotional experiences, even for 15 minutes, improves mood, reduces stress, and helps you understand yourself better.</p>
                            <button onClick={()=>setModal("new")} style={{ padding:"12px 30px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:12, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Start writing →</button>
                          </>
                        ) : (
                          <>
                            <p style={{ color:"#A09080", fontSize:14, marginBottom:32 }}>What would you like to write about today?</p>
                            <button onClick={()=>setModal("new")} style={{ padding:"11px 26px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:11, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>+ New entry</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CARDS HOME */}
                  {section === "cards" && (
                    <div style={{ flex:1, overflowY:"auto" }}>
                      <div style={{ maxWidth:660, margin:"0 auto", padding:"56px 48px" }} className="fi">
                        <h2 style={{ fontFamily:"'Lora',serif", fontSize:30, fontWeight:600, color:"#2C1F14", marginBottom:8, letterSpacing:-.3 }}>Cards</h2>
                        <p style={{ color:"#A09080", fontSize:15, marginBottom:8, lineHeight:1.7, fontWeight:300 }}>A space to empty your mind. Write fast, unfiltered, without thinking about it.</p>
                        <p style={{ color:"#B8AFA5", fontSize:13.5, marginBottom:36, lineHeight:1.7, fontStyle:"italic", fontFamily:"'Lora',serif" }}>No AI responding. No questions. Just you and the page.</p>

                        {/* cards grid */}
                        {cards.length > 0 && (
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:28 }}>
                            {cards.map(c => (
                              <div key={c.id} className="card-hover" onClick={()=>openCardById(c.id)}
                                style={{ padding:"18px 18px 14px", background:"white", border:"1px solid #E8E3DB", borderRadius:14, cursor:"pointer", transition:"all .15s" }}>
                                <div style={{ fontSize:13.5, color:"#2C1F14", lineHeight:1.7, marginBottom:10, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:4, WebkitBoxOrient:"vertical", fontFamily:"'Lora',serif", minHeight:52, fontStyle:c.body?"normal":"italic" }}>
                                  {c.body || <span style={{ color:"#C5BDB5" }}>Empty</span>}
                                </div>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                  <span style={{ fontSize:11, color:"#C5BDB5" }}>{timeAgo(c.updatedAt||c.createdAt)}</span>
                                  <button onClick={e=>{e.stopPropagation();deleteCard(c.id);}} style={{ fontSize:11, color:"#D5CEC6", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Delete</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                          <button onClick={createCard} style={{ padding:"12px 28px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:12, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                            + New card
                          </button>

                          {/* Make sense button — only when 3+ filled cards */}
                          {filledCards.length >= 3 && (
                            <button onClick={makeSense} disabled={synthBusy}
                              style={{ padding:"12px 24px", background:"#F5EDE3", color:"#8B5E3C", border:"1px solid #DCC9B3", borderRadius:12, fontSize:14, fontWeight:600, cursor:synthBusy?"default":"pointer", fontFamily:"'DM Sans',sans-serif", opacity:synthBusy?.7:1 }}>
                              {synthBusy ? "Reading your cards..." : "✦ Make sense of this"}
                            </button>
                          )}
                        </div>

                        {/* Synthesis result */}
                        {synthBusy && (
                          <div style={{ marginTop:36 }}>
                            <TypingRow label={true}/>
                          </div>
                        )}

                        {synthesis && !synthBusy && (
                          <div style={{ marginTop:36, background:"#F5EDE3", border:"1px solid #DCC9B3", borderRadius:18, padding:"28px 28px" }} className="fi">
                            <div style={{ fontSize:10.5, fontWeight:700, color:"#8B5E3C", textTransform:"uppercase", letterSpacing:1.8, marginBottom:16 }}>What Resolve sees</div>
                            <div style={{ fontSize:15.5, lineHeight:1.9, color:"#2C1F14", whiteSpace:"pre-wrap", fontFamily:"'Lora',serif" }}>{synthesis}</div>
                            <button onClick={()=>setSynthesis(null)} style={{ marginTop:20, fontSize:12, color:"#B8AFA5", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Dismiss</button>
                          </div>
                        )}

                        {filledCards.length > 0 && filledCards.length < 3 && (
                          <p style={{ marginTop:20, fontSize:12.5, color:"#C5BDB5", fontStyle:"italic", fontFamily:"'Lora',serif" }}>
                            Write {3 - filledCards.length} more card{3-filledCards.length!==1?"s":""} to unlock "Make sense of this"
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PROFILE HOME */}
                  {section === "profile" && (
                    <ProfileView userName={userName} entries={entries} cards={cards} isPro={isPro}
                      onUpgrade={()=>{ setUpgradeReason("Your psychological portrait is a Pro feature."); setShowUpgrade(true); }}/>
                  )}
                </>
              )}

              {/* CARD */}
              {screen === "card" && openCard && (
                <CardView card={openCard} onUpdate={updateCard} onClose={closeCard}/>
              )}

              {/* WRITE */}
              {screen === "write" && (
                <>
                  <div style={{ padding:"0 20px", height:50, borderBottom:"1px solid rgba(0,0,0,0.055)", display:"flex", alignItems:"center", gap:12, flexShrink:0, background:"#FAF7F2" }}>
                    <button onClick={goHome} style={{ border:"none", background:"none", cursor:"pointer", fontSize:16, color:"#B8AFA5", padding:"4px 6px" }}>←</button>
                    <span style={{ fontWeight:500, fontSize:14, color:"#7A6A5C", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Lora',serif", fontStyle:"italic" }}>{entry?.title}</span>
                    {/* phase indicator */}
                    <span style={{ fontSize:11, color: exchangeCount < 3 ? "#B5936E" : "#2D5A27", background: exchangeCount < 3 ? "#FEF0E6" : "#EDF4EC", padding:"3px 10px", borderRadius:20, flexShrink:0 }}>
                      {exchangeCount < 3 ? "sharing" : "processing"}
                    </span>
                    {aRole==="A" && (
                      <button onClick={()=>{ if(!isPro){setUpgradeReason("Inviting a partner requires Pro or Duo.");setShowUpgrade(true);}else setModal("invite"); }} style={{ padding:"5px 13px", background:"transparent", border:"1px solid #E0D9D0", borderRadius:8, cursor:"pointer", fontSize:12, color:"#A09080", fontFamily:"'DM Sans',sans-serif" }}>+ Invite someone</button>
                    )}
                    {hasPartner && (
                      <button onClick={openGroup} style={{ padding:"6px 14px", background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                        Open with {partnerName} →
                      </button>
                    )}
                  </div>
                  <div style={{ flex:1, overflowY:"auto", background:"#FAF7F2" }}>
                    {msgs.map((m,i)=><Row key={m.id||i} msg={m} myName={myName}/>)}
                    {busy && <TypingRow/>}
                    <div style={{ height:140 }}/><div ref={bottomRef}/>
                  </div>
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"10px 22px 18px", background:"linear-gradient(to top,#FAF7F2 72%,transparent)" }}>
                    <div style={{ maxWidth:660, margin:"0 auto", background:"white", borderRadius:16, border:"1.5px solid #E0D9D0", boxShadow:"0 2px 18px rgba(44,31,20,.06)", display:"flex", alignItems:"flex-end" }}>
                      <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}}
                        placeholder="Write freely — there's no right or wrong way..." rows={1}
                        style={{ flex:1, padding:"14px 16px", border:"none", fontSize:15.5, resize:"none", outline:"none", lineHeight:1.7, background:"transparent", color:"#2C1F14", minHeight:52, maxHeight:200 }}/>
                      <button onClick={sendMsg} disabled={busy||!input.trim()}
                        style={{ margin:"8px 10px 8px 0", padding:"8px 18px", background:busy||!input.trim()?"#E8E3DB":"#2C1F14", color:busy||!input.trim()?"#C5BDB5":"#B5936E", border:"none", borderRadius:10, cursor:busy||!input.trim()?"default":"pointer", fontWeight:600, fontSize:14, fontFamily:"'DM Sans',sans-serif", transition:"all .15s", flexShrink:0 }}>
                        Send
                      </button>
                    </div>
                    <p style={{ textAlign:"center", fontSize:11, color:"#C5BDB5", marginTop:6 }}>Private · Only you can see this</p>
                  </div>
                </>
              )}

              {/* GROUP */}
              {screen === "group" && (
                <>
                  <div style={{ padding:"0 20px", height:50, borderBottom:"1px solid rgba(0,0,0,0.055)", display:"flex", alignItems:"center", gap:12, flexShrink:0, background:"#FAF7F2" }}>
                    <button onClick={()=>{setScreen("write");setMsgs(entry[pKey]?.chatHistory||[]);}} style={{ border:"none", background:"none", cursor:"pointer", fontSize:16, color:"#B8AFA5", padding:"4px 6px" }}>←</button>
                    <span style={{ fontWeight:600, fontSize:14, color:"#2C1F14", fontFamily:"'Lora',serif", fontStyle:"italic", flex:1 }}>{entry?.title}</span>
                    <span style={{ fontSize:12, color:"#A09080" }}>· With {partnerName}</span>
                  </div>
                  <div style={{ flex:1, overflowY:"auto", background:"#FAF7F2" }}>
                    <div style={{ maxWidth:660, margin:"0 auto", padding:"22px 26px 130px" }}>
                      {msgs.map((m,i)=><GRow key={m.id||i} msg={m} aRole={aRole}/>)}
                      {busy && <div style={{ display:"flex", justifyContent:"center", margin:"16px 0" }}><div style={{ background:"#F5EDE3", border:"1px solid #DCC9B3", padding:"10px 16px", borderRadius:10, display:"flex", gap:5 }}>{[0,.22,.44].map((d,i)=><span key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#B5936E", display:"inline-block", animation:`rp 1.2s ease ${d}s infinite` }}/>)}</div></div>}
                      <div ref={bottomRef}/>
                    </div>
                  </div>
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"10px 22px 18px", background:"linear-gradient(to top,#FAF7F2 72%,transparent)" }}>
                    <div style={{ maxWidth:660, margin:"0 auto", background:"white", borderRadius:16, border:"1.5px solid #E0D9D0", boxShadow:"0 2px 18px rgba(44,31,20,.06)", display:"flex", alignItems:"flex-end" }}>
                      <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}} placeholder={`Say something as ${myName}...`} rows={2}
                        style={{ flex:1, padding:"14px 16px", border:"none", fontSize:15.5, resize:"none", outline:"none", lineHeight:1.7, background:"transparent", color:"#2C1F14" }}/>
                      <button onClick={sendMsg} disabled={busy||!input.trim()}
                        style={{ margin:"8px 10px 8px 0", padding:"8px 18px", background:busy||!input.trim()?"#E8E3DB":"#2C1F14", color:busy||!input.trim()?"#C5BDB5":"#B5936E", border:"none", borderRadius:10, cursor:busy||!input.trim()?"default":"pointer", fontWeight:600, fontSize:14, fontFamily:"'DM Sans',sans-serif", transition:"all .15s", flexShrink:0 }}>
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </main>
          </div>
        )}

        {/* MODALS */}
        {/* UPGRADE MODAL */}
        {showUpgrade && (
          <UpgradeModal reason={upgradeReason} currentPlan={plan} onClose={()=>setShowUpgrade(false)}/>
        )}

        {modal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(44,31,20,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(5px)" }}
            onClick={()=>setModal(null)}>
            <div className="fi" style={{ background:"#FAF7F2", borderRadius:20, padding:30, width:"100%", maxWidth:420, margin:24, boxShadow:"0 24px 60px rgba(44,31,20,.2)" }}
              onClick={e=>e.stopPropagation()}>

              {modal==="new" && <>
                <h3 style={{ fontFamily:"'Lora',serif", fontSize:24, fontWeight:600, marginBottom:6, color:"#2C1F14" }}>What's on your mind?</h3>
                <p style={{ color:"#A09080", fontSize:13.5, marginBottom:20, lineHeight:1.6 }}>Give it a title. You'll explain everything once you're inside.</p>
                <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&startEntry()}
                  placeholder="e.g. The conversation I never had with my dad..." autoFocus
                  style={{ width:"100%", padding:"12px 14px", borderRadius:11, border:"1.5px solid #E0D9D0", fontSize:14, outline:"none", marginBottom:13, color:"#2C1F14", background:"white", fontFamily:"'DM Sans',sans-serif" }}
                  onFocus={e=>e.target.style.borderColor="#B5936E"} onBlur={e=>e.target.style.borderColor="#E0D9D0"}/>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={startEntry} style={{ flex:1, padding:12, background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:11, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Start writing</button>
                  <button onClick={()=>setModal(null)} style={{ padding:"12px 15px", background:"#EDE7DF", border:"none", borderRadius:11, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", color:"#7A6A5C" }}>Cancel</button>
                </div>
              </>}

              {modal==="join" && <>
                <h3 style={{ fontFamily:"'Lora',serif", fontSize:24, fontWeight:600, marginBottom:6, color:"#2C1F14" }}>Join someone's entry</h3>
                <p style={{ color:"#A09080", fontSize:13.5, marginBottom:20, lineHeight:1.6 }}>Enter the code they shared. Resolve will hear your side privately first.</p>
                <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&joinEntry()}
                  placeholder="e.g. AB1C2D" autoFocus
                  style={{ width:"100%", padding:"12px 14px", borderRadius:11, border:"1.5px solid #E0D9D0", fontSize:20, outline:"none", marginBottom:13, fontFamily:"monospace", letterSpacing:4, textAlign:"center", color:"#2C1F14", background:"white" }}
                  onFocus={e=>e.target.style.borderColor="#B5936E"} onBlur={e=>e.target.style.borderColor="#E0D9D0"}/>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={joinEntry} style={{ flex:1, padding:12, background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:11, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Join</button>
                  <button onClick={()=>setModal(null)} style={{ padding:"12px 15px", background:"#EDE7DF", border:"none", borderRadius:11, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", color:"#7A6A5C" }}>Cancel</button>
                </div>
              </>}

              {modal==="invite" && entry && <>
                <h3 style={{ fontFamily:"'Lora',serif", fontSize:24, fontWeight:600, marginBottom:6, color:"#2C1F14" }}>Bring someone in</h3>
                <p style={{ color:"#A09080", fontSize:13.5, marginBottom:18, lineHeight:1.6 }}>Share this code. Resolve will hear their side privately first.</p>
                <div style={{ fontFamily:"monospace", fontSize:26, letterSpacing:6, color:"#2C1F14", fontWeight:700, textAlign:"center", padding:"14px", background:"#EDE7DF", borderRadius:12, marginBottom:12 }}>{entry.inviteCode}</div>
                <button onClick={()=>{navigator.clipboard.writeText(entry.inviteCode);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                  style={{ width:"100%", padding:11, background:"#2C1F14", color:"#B5936E", border:"none", borderRadius:11, cursor:"pointer", fontWeight:600, fontSize:14, fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>
                  {copied?"Copied ✓":"Copy code"}
                </button>
                <button onClick={()=>setModal(null)} style={{ width:"100%", padding:"9px", background:"transparent", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", color:"#A09080", fontSize:13 }}>Done</button>
              </>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
