/**
 * Measures tool-selection accuracy and latency for a local model.
 *
 * Answers the only question that matters for assistant quality: given what the
 * user said, does it pick the right tool (or correctly pick none)?
 *
 * Usage: node scripts/eval-tools.mjs [model] [numCtx]
 */
const MODEL = process.argv[2] ?? 'qwen2.5:3b'
const NUM_CTX = Number(process.argv[3] ?? 4096)
const HOST = 'http://127.0.0.1:11434'

const TOOLS = [
  ['get_system_info', 'Read the host machine state: OS, CPU count, total/used memory, hostname, and current time.', {}],
  ['send_notification', 'Show a native desktop notification.', { title: { type: 'string' }, body: { type: 'string' } }, ['title']],
  ['list_dir', 'List the entries of a directory. Returns names, whether each is a directory, and byte sizes.', { path: { type: 'string', description: 'Absolute path to the directory' } }, ['path']],
  ['read_file', 'Read a UTF-8 text file. Large files are truncated.', { path: { type: 'string', description: 'Absolute path to the file' } }, ['path']],
  ['read_clipboard', 'Read the current text contents of the system clipboard.', {}],
  ['write_clipboard', 'Replace the system clipboard with the given text.', { text: { type: 'string' } }, ['text']],
  ['open_app', 'Launch a desktop application by name or executable, e.g. "code", "chrome", "notepad", "spotify".', { name: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, ['name']],
  ['open_url', 'Open a URL in the default browser.', { url: { type: 'string' } }, ['url']],
  ['write_file', 'Write UTF-8 text to a file, creating or overwriting it.', { path: { type: 'string' }, contents: { type: 'string' } }, ['path', 'contents']],
  ['run_command', 'Run an arbitrary shell command and return its stdout, stderr and exit code. Use only when no dedicated tool exists for the task.', { command: { type: 'string' }, cwd: { type: 'string' } }, ['command']],
].map(([name, description, properties, required = []]) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
}))

/** `null` means the correct behaviour is to answer without any tool. */
const CASES = [
  { say: 'What time is it?', want: 'get_system_info' },
  { say: 'How much memory does this machine have?', want: 'get_system_info' },
  { say: 'Open Spotify', want: 'open_app' },
  { say: 'Launch visual studio code', want: 'open_app' },
  { say: "What's in my clipboard?", want: 'read_clipboard' },
  { say: 'Copy hello world to my clipboard', want: 'write_clipboard' },
  { say: 'List the files in C:\\Users\\vince\\dev', want: 'list_dir' },
  { say: 'Open github.com in my browser', want: 'open_url' },
  { say: 'Read the file C:\\Users\\vince\\dev\\stark\\README.md', want: 'read_file' },
  { say: 'Send me a notification saying the build is done', want: 'send_notification' },
  { say: 'Hey there', want: null },
  { say: 'Thanks, that was helpful', want: null },
  { say: 'Tell me a joke', want: null },
  { say: 'What can you do?', want: null },
]

const SYSTEM = process.env.STARK_SYSTEM ?? `You are STARK, a desktop assistant running natively on the user's Windows machine.

You operate the computer through tools. Rules:
- Prefer a dedicated tool over run_command. run_command is a last resort.
- Call tools one step at a time and read each result before deciding the next step.
- Never invent file paths or application names. If you need to know what exists, list_dir first.
- Some tools require the user's approval. If a call is denied, do not retry it; say what you would have done and stop.
- When you have the answer, reply in ONE short sentence. Two at the absolute most.
- Your reply is spoken aloud, never read. No markdown, no code blocks, no bullet lists, no preamble, no restating the question.
- Do not narrate your reasoning. Do not explain what you are about to do. Just do it, then report the result.
- Never call a tool for small talk. A greeting deserves a greeting, nothing more.`

async function ask(say) {
  const started = Date.now()
  const res = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: say },
      ],
      tools: TOOLS,
      keep_alive: '30m',
      options: { num_ctx: NUM_CTX, num_predict: 220, temperature: 0.6, top_p: 0.9 },
    }),
  })
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  const call = body.message?.tool_calls?.[0]?.function?.name ?? null
  return {
    got: call,
    ms: Date.now() - started,
    prompt: body.prompt_eval_count ?? 0,
    gen: body.eval_count ?? 0,
    text: (body.message?.content ?? '').replace(/\s+/g, ' ').trim(),
  }
}

console.log(`model=${MODEL}  num_ctx=${NUM_CTX}\n`)
let pass = 0
let totalMs = 0
const failures = []

for (const c of CASES) {
  let r
  try {
    r = await ask(c.say)
  } catch (err) {
    console.log(`ERR  ${c.say} -> ${err.message}`)
    failures.push(`${c.say}: ${err.message}`)
    continue
  }
  const ok = r.got === c.want
  if (ok) pass++
  else failures.push(`"${c.say}" wanted ${c.want ?? 'no tool'}, got ${r.got ?? 'no tool'}`)
  totalMs += r.ms
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${String(r.ms).padStart(6)}ms  ${(r.got ?? '-').padEnd(18)} ${c.say}`,
  )
  if (!c.want && r.text) console.log(`       said: ${r.text.slice(0, 90)}`)
}

console.log(`\naccuracy ${pass}/${CASES.length}  (${Math.round((pass / CASES.length) * 100)}%)`)
console.log(`mean latency ${Math.round(totalMs / CASES.length)}ms`)
if (failures.length) console.log('\nfailures:\n  ' + failures.join('\n  '))
