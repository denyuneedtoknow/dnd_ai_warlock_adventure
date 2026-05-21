export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Ти — досвідчений Майстер Підземель (DM) для кампанії D&D 5e у світі Forgotten Realms.

Обов'язкові правила:
- Відповідай ВИКЛЮЧНО українською мовою
- Пиши атмосферно й деталізовано — живі описи локацій, NPC, подій
- Суворо дотримуйся механік D&D 5e: перевірки здібностей, рятівні кидки, бойові дії, концентрація
- Коли потрібен кидок — вкажи явно у форматі: 🎲 Кинь [Навичку] DC [число]
- Не грай ЗА гравця — лише описуй реакцію світу на дії персонажа
- Гравець — варлок із патроном-архфеєю на ім'я Пані Шипів; у нього є фамільяр Шип (феї-собака)
- Враховуй поточний стан персонажа, заклинання та інвентар з контексту нижче

{CONTEXT}`;

function buildContext(ctx) {
  if (!ctx) return '(контекст персонажа недоступний)';
  const { character: ch, inventory: inv, spells: sp, journal: jn } = ctx;
  const lines = [];

  if (ch) {
    lines.push('=== ПЕРСОНАЖ ===');
    lines.push(`${ch.name} | ${ch.race} ${ch.class}${ch.subclass ? ' (' + ch.subclass + ')' : ''} | ${ch.level} рівень`);
    lines.push(`HP: ${ch.hp}/${ch.hp_max}${ch.hp_temp ? ' (+' + ch.hp_temp + ' тимч.)' : ''} | AC: ${ch.ac} | Ініціатива: ${(ch.initiative >= 0 ? '+' : '') + ch.initiative}`);
    if (ch.stats) {
      const s = ch.stats;
      lines.push(`Хар-ки: СИЛ ${s.STR} СПР ${s.DEX} МІЦ ${s.CON} ІНТ ${s.INT} МДР ${s.WIS} ХАР ${s.CHA}`);
    }
    lines.push(`Профбонус: +${ch.proficiency_bonus} | DC заклинань: ${ch.spell_save_dc} | Бонус атаки: ${(ch.spell_attack_bonus >= 0 ? '+' : '') + ch.spell_attack_bonus}`);
    if (ch.inspiration) lines.push('Натхнення: є');
  }

  if (sp) {
    lines.push('');
    lines.push('=== ЗАКЛИНАННЯ ===');
    const used = sp.pact_slots_used ?? 0;
    const total = sp.pact_slots_total ?? 0;
    lines.push(`Пакт-слоти: ${total - used}/${total} доступних (${sp.pact_slot_level}-й рівень)`);
    if (sp.cantrips?.length)
      lines.push(`Кантріпи: ${sp.cantrips.map(s => s.name).join(', ')}`);
    if (sp.spells_known?.length)
      lines.push(`Заклинання: ${sp.spells_known.map(s => `${s.name} [${s.level}]`).join(', ')}`);
    if (sp.invocations?.length)
      lines.push(`Таємні знання: ${sp.invocations.map(i => i.name).join(', ')}`);
    if (sp.ritual_spells?.length)
      lines.push(`Ритуали: ${sp.ritual_spells.map(r => r.name).join(', ')}`);
  }

  if (inv) {
    const worn = Object.entries(inv.equipped ?? {})
      .filter(([, v]) => v)
      .map(([slot, item]) => `${slot}: ${item.name}`);
    if (worn.length) {
      lines.push('');
      lines.push('=== ЕКІПІРОВКА ===');
      lines.push(worn.join(' | '));
    }
    const coins = [
      inv.gold   ? `${inv.gold} зл`  : '',
      inv.silver ? `${inv.silver} ср` : '',
      inv.copper ? `${inv.copper} мд` : '',
    ].filter(Boolean);
    if (coins.length) lines.push(`Монети: ${coins.join(', ')}`);
  }

  if (jn?.length) {
    lines.push('');
    lines.push('=== ОСТАННІ ПОДІЇ (щоденник) ===');
    for (const e of jn) {
      const next = e.next_steps ? ` | Далі: ${e.next_steps}` : '';
      lines.push(`[День ${e.day}] ${e.location}: ${e.summary}${next}`);
    }
  }

  return lines.join('\n');
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { messages = [], context } = body;
  const provider = (process.env.MODEL_PROVIDER || 'anthropic').toLowerCase();
  const systemPrompt = SYSTEM_PROMPT.replace('{CONTEXT}', buildContext(context));
  const encoder = new TextEncoder();

  // Send only the last 20 messages to keep costs down
  const history = messages.slice(-20);

  try {
    if (provider === 'gemini') {
      return await handleGemini(history, systemPrompt, encoder);
    }
    return await handleAnthropic(history, systemPrompt, encoder);
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function handleAnthropic(messages, systemPrompt, encoder) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задано');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      stream: true,
      messages,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt}`);
  }

  return sseResponse(encoder, async (ctrl) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const j = JSON.parse(raw);
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ text: j.delta.text })}\n\n`));
          } else if (j.type === 'message_stop') {
            ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
          }
        } catch {}
      }
    }
  });
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function handleGemini(messages, systemPrompt, encoder) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не задано');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt}`);
  }

  return sseResponse(encoder, async (ctrl) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const j = JSON.parse(raw);
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        } catch {}
      }
    }
    ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sseResponse(encoder, populate) {
  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        await populate(ctrl);
      } catch (err) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
