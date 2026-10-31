import React, { Fragment, useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import learnsphereMark from "./assets/learnsphere-mark.png";

const grades = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const subjects = ["General", "Science", "Maths", "Social Studies", "English"];
const languages = ["English", "Hindi", "Hinglish"];
const MAX_IMAGE_BASE64_CHARS = 7000000;

function topicPlaceholder(grade, subject) {
  const senior = grade === "Class 11" || grade === "Class 12";
  const examples = {
    Maths: senior ? "integration or matrices" : "fractions or algebra",
    English: senior ? "literary devices or prose analysis" : "grammar or reading comprehension",
    Science: senior ? "electrochemistry or genetics" : "photosynthesis or forces",
    "Social Studies": senior ? "the Indian economy or the Constitution" : "the freedom movement or resources"
  };
  return `For example, ${examples[subject] || "a topic from your class"}`;
}

async function fetchApi(path, options, onUnauthorized) {
  const response = await fetch(path, options);
  if (response.status === 401) onUnauthorized?.();
  return response;
}

const studyShortcuts = [
  {
    icon: "check",
    category: "PRACTICE",
    title: "Take a practice test",
    description: "Answer questions, get your score, and review explanations.",
    tab: "exam"
  },
  {
    icon: "book",
    category: "REFLECT",
    title: "Review your mistakes",
    description: "Revisit corrections and notes from past tests.",
    tab: "mistakes"
  },
  {
    icon: "leaf",
    category: "PLAN",
    title: "Build a study roadmap",
    description: "Organize subjects and track your daily progress.",
    tab: "roadmap"
  },
  {
    icon: "spark",
    category: "RECALL",
    title: "Make flashcards",
    description: "Create a deck for the topic you are studying.",
    tab: "flashcards"
  }
];

function Icon({ name, size = 18 }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h7" /></>,
    spark: <><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    send: <><path d="M5 12h13" /><path d="m12 6 6 6-6 6" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v4h14v-4" /></>,
    paperclip: <path d="m8 12.5 5.5-5.5a3 3 0 0 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.5-7.5" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="m7 17 10-10M7 7h10v10" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    leaf: <><path d="M20 4c-7 0-13 2-13 9a6 6 0 0 0 6 6c7 0 9-6 7-15Z" /><path d="M4 21c2-5 6-8 12-12" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function normalizePlainText(text) {
  return text
    .replace(/C_6H_\{?12\}?O_6\b/g, "C₆H₁₂O₆")
    .replace(/H_2\b/g, "H₂")
    .replace(/CO_2\b/g, "CO₂")
    .replace(/O_2\b/g, "O₂");
}

function MathExpression({ expression, displayMode = false, className = "" }) {
  const html = katex.renderToString(expression.trim(), {
    displayMode,
    throwOnError: false,
    strict: "ignore"
  });
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const mathDelimiters = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
const latexCommand = /\\(?:dfrac|tfrac|frac|sqrt|times|cdot|pm|mp|leq|geq|neq|approx|rightarrow|longrightarrow|to|div|le|ge|ne|in|notin|infty|pi|theta|alpha|beta|gamma|sum|int|left|right|mathrm|text|overline|sin|cos|tan|log|ln)\b/;
const bareMathAtom = String.raw`(?:\\[A-Za-z]+(?:\{[^{}]*\}){0,2}|[A-Za-z]|\d+(?:\.\d+)?)`;
const bareMathSuffix = String.raw`(?:\s*(?:\^\s*(?:\{[^{}]+\}|[A-Za-z0-9]+)|_\s*(?:\{[^{}]+\}|[A-Za-z0-9]+)))?`;
const bareMathExpression = new RegExp(
  String.raw`(?<![\w\\])(?:[+-]\s*)?${bareMathAtom}${bareMathSuffix}(?:\s*(?:[+\-*/=<>≤≥×÷]|\\(?:cdot|times|div|leq|geq|neq|approx))\s*(?:[+-]\s*)?${bareMathAtom}${bareMathSuffix})*(?![\w])`,
  "g"
);

function normalizeMathText(text) {
  const normalized = text.replace(/\u000c(?=rac\b)/g, "\\f");
  const trimmed = normalized.trimEnd();
  const dollarCount = (trimmed.match(/\$/g) || []).length;
  if (latexCommand.test(trimmed) && trimmed.endsWith("$") && dollarCount % 2 === 1) {
    return trimmed.slice(0, -1) + normalized.slice(trimmed.length);
  }
  return normalized;
}

function renderBareMath(text, prefix) {
  const match = latexCommand.exec(text);
  latexCommand.lastIndex = 0;
  if (match) {
    let start = match.index;
    if (start > 0 && /[+-]/.test(text[start - 1])) start -= 1;
    const before = normalizePlainText(text.slice(0, start));
    const suffix = text.slice(start);
    const closingDelimiter = suffix.indexOf("$");
    const expression = (closingDelimiter >= 0 ? suffix.slice(0, closingDelimiter) : suffix).trim();
    const afterMath = closingDelimiter >= 0 ? suffix.slice(closingDelimiter + 1) : "";
    return (
      <>
        {before && <Fragment key={prefix + "-before"}>{before}</Fragment>}
        <MathExpression key={prefix + "-math"} expression={expression} />
        {afterMath && <Fragment key={prefix + "-after"}>{renderMathText(afterMath, prefix + "-after")}</Fragment>}
      </>
    );
  }

  const parts = [];
  let lastIndex = 0;
  for (const candidate of text.matchAll(bareMathExpression)) {
    const expression = candidate[0];
    if (!/[+\-*/=<>≤≥×÷^_]|\\(?:cdot|times|div|leq|geq|neq|approx)/.test(expression)) continue;
    const start = candidate.index;
    if (start > lastIndex) {
      parts.push(normalizePlainText(text.slice(lastIndex, start)));
    }
    parts.push(
      <MathExpression
        key={`${prefix}-bare-math-${start}`}
        expression={expression}
      />
    );
    lastIndex = start + expression.length;
  }
  if (!parts.length) return normalizePlainText(text);
  if (lastIndex < text.length) parts.push(normalizePlainText(text.slice(lastIndex)));
  return parts;
}

function renderMathText(text, prefix) {
  text = normalizeMathText(text);
  const parts = text.split(mathDelimiters);
  return parts.map((part, index) => {
    if (!part) return null;
    const key = prefix + "-math-part-" + index;
    if (part.startsWith("$$") && part.endsWith("$$")) {
      return <MathExpression key={key} expression={part.slice(2, -2)} displayMode />;
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return <MathExpression key={key} expression={part.slice(1, -1)} />;
    }
    if (part.startsWith("\\[") && part.endsWith("\\]")) {
      return <MathExpression key={key} expression={part.slice(2, -2)} displayMode />;
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      return <MathExpression key={key} expression={part.slice(2, -2)} />;
    }
    return <Fragment key={key}>{renderBareMath(part, key)}</Fragment>;
  });
}

function inlineParts(text, prefix) {
  return text.split(/(\*\*.+?\*\*|\*.+?\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={prefix + "-b-" + index}>{renderMathText(part.slice(2, -2), prefix + "-b-" + index)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={prefix + "-i-" + index}>{renderMathText(part.slice(1, -1), prefix + "-i-" + index)}</em>;
    }
    return <Fragment key={prefix + "-t-" + index}>{renderMathText(part, prefix + "-t-" + index)}</Fragment>;
  });
}

function answerBlocks(text) {
  text = normalizeMathText(text);
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = "";

  function flushParagraph() {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  }

  function flushList() {
    if (listItems.length) blocks.push({ type: listType, items: listItems });
    listItems = [];
    listType = "";
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (
      latexCommand.test(line) &&
      /^(?:[+-]?\s*)?\\(?:dfrac|tfrac|frac|sqrt)\b/.test(line)
    ) {
      flushParagraph();
      flushList();
      blocks.push({ type: "math", expression: line });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[2] });
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const item = ordered || unordered;
    if (item) {
      flushParagraph();
      const nextType = ordered ? "ordered" : "unordered";
      if (listItems.length && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(item[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function AnswerContent({ text }) {
  return (
    <div className="answer-content">
      {answerBlocks(text).map((block, index) => {
        if (block.type === "math") {
          return (
            <div className="answer-math-display" key={"math-" + index}>
              <MathExpression expression={block.expression} displayMode />
            </div>
          );
        }
        if (block.type === "heading") {
          return <h3 key={"heading-" + index}>{inlineParts(block.text, "h-" + index)}</h3>;
        }
        if (block.type === "ordered" || block.type === "unordered") {
          const Tag = block.type === "ordered" ? "ol" : "ul";
          return (
            <Tag key={"list-" + index}>
              {block.items.map((item, itemIndex) => (
                <li key={"item-" + itemIndex}>{inlineParts(item, "l-" + index + "-" + itemIndex)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={"paragraph-" + index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={"line-" + lineIndex}>
                {lineIndex > 0 && <br />}
                {inlineParts(line, "p-" + index + "-" + lineIndex)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const pythonCodeStorageKey = "learnsphere-python-code-v1";
const starterPythonCode = `name = input("What is your name? ")
print(f"Hello, {name}!")

for step in range(1, 4):
    print(f"Practice step {step}")`;

function restorePythonCode() {
  try {
    const saved = window.localStorage.getItem(pythonCodeStorageKey);
    return saved && saved.length <= 12000 ? saved : starterPythonCode;
  } catch {
    return starterPythonCode;
  }
}

function PythonWorkspace() {
  const [code, setCode] = useState(restorePythonCode);
  const [stdin, setStdin] = useState("Learner");
  const [output, setOutput] = useState({ stdout: "", stderr: "", error: false });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const workerRef = useRef(null);
  const requestIdRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(pythonCodeStorageKey, code);
      setSaveError("");
    } catch {
      setSaveError("Your code could not be saved in this browser.");
    }
  }, [code]);

  useEffect(() => () => {
    window.clearTimeout(timeoutRef.current);
    workerRef.current?.terminate();
  }, []);

  function stopAfterTimeout(stage) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      requestIdRef.current = null;
      setRunning(false);
      setStatus("");
      setOutput({
        stdout: "",
        stderr: stage === "loading"
          ? "The offline Python runtime took too long to start. Check the local app files and try again."
          : "Execution stopped after 10 seconds. Check your code for a long-running loop.",
        error: true
      });
    }, stage === "loading" ? 120000 : 10000);
  }

  function handleWorkerMessage({ data }) {
    if (data?.requestId !== requestIdRef.current) return;
    if (data.type === "status") {
      setStatus(data.status === "loading" ? "Starting the local Python runtime…" : "Running your code…");
      stopAfterTimeout(data.status);
      return;
    }
    window.clearTimeout(timeoutRef.current);
    requestIdRef.current = null;
    setRunning(false);
    setStatus("");
    if (data.type === "result") {
      setOutput({ stdout: data.stdout, stderr: data.stderr, error: Boolean(data.stderr) });
      return;
    }
    setOutput({ stdout: "", stderr: data.message, error: true });
  }

  function runCode(event) {
    event.preventDefault();
    if (running || !code.trim()) return;
    if (typeof Worker === "undefined") {
      setOutput({ stdout: "", stderr: "This browser does not support the local Python workspace.", error: true });
      return;
    }
    setRunning(true);
    setStatus("Starting the local Python runtime…");
    setOutput({ stdout: "", stderr: "", error: false });
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = requestId;
    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./python.worker.js", import.meta.url), { type: "module" });
        workerRef.current.onmessage = handleWorkerMessage;
        workerRef.current.onerror = (error) => {
          window.clearTimeout(timeoutRef.current);
          workerRef.current?.terminate();
          workerRef.current = null;
          requestIdRef.current = null;
          setRunning(false);
          setStatus("");
          setOutput({
            stdout: "",
            stderr: error.message || "The local Python runtime failed to load.",
            error: true
          });
        };
      }
      stopAfterTimeout("loading");
      workerRef.current.postMessage({ type: "run", requestId, code, stdin });
    } catch (error) {
      window.clearTimeout(timeoutRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      requestIdRef.current = null;
      setRunning(false);
      setStatus("");
      setOutput({
        stdout: "",
        stderr: error instanceof Error ? error.message : "The local Python runtime could not start.",
        error: true
      });
    }
  }

  function resetCode() {
    if (running) return;
    setCode(starterPythonCode);
    setStdin("Learner");
    setOutput({ stdout: "", stderr: "", error: false });
  }

  return (
    <section className="study-card feature-page" role="tabpanel" id="python-panel" aria-labelledby="python-tab" tabIndex={0}>
      <div className="feature-scroll python-workspace">
        <div className="feature-heading">
          <span className="welcome-kicker"><Icon name="spark" size={16} /> COMPUTER SCIENCE · PYTHON</span>
          <h2>Learn to code</h2>
          <p>Write and run Python in this page. The interpreter is bundled with LearnSphere and runs on your device; code is not sent to Gemma or the server.</p>
        </div>
        <form className="python-editor-card" onSubmit={runCode}>
          <div className="python-editor-toolbar">
            <label htmlFor="python-source">Python 3</label>
            <div>
              <button className="python-reset-button" type="button" onClick={resetCode} disabled={running}>Reset example</button>
              <button className="feature-primary-button python-run-button" type="submit" disabled={running || !code.trim()}>
                {running ? "Running…" : "Run Python"}
              </button>
            </div>
          </div>
          <label className="visually-hidden" htmlFor="python-source">Python code</label>
          <textarea
            id="python-source"
            className="python-code-editor"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={12000}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-describedby="python-editor-help"
          />
          <p id="python-editor-help" className="python-editor-help">Use <code>input()</code> to read the optional input below. Runs are limited to 10 seconds.</p>
          <label className="python-input-label" htmlFor="python-stdin">Program input <span>One answer per line</span></label>
          <textarea
            id="python-stdin"
            className="python-stdin-editor"
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            maxLength={4000}
            rows={2}
            aria-label="Program input, one answer per line"
          />
          <div className="python-output" aria-live="polite" aria-busy={running}>
            <div className="python-output-heading">
              <strong>Output</strong>
              {status && <span role="status">{status}</span>}
            </div>
            {output.stdout && <pre>{output.stdout}</pre>}
            {output.stderr && <pre className={output.error ? "python-error-output" : ""}>{output.stderr}</pre>}
            {!output.stdout && !output.stderr && !status && <p>Your program’s output will appear here.</p>}
          </div>
          {saveError && <p className="python-storage-error" role="alert">{saveError}</p>}
        </form>
        <p className="python-offline-note"><Icon name="leaf" size={14} /> Python runs in a browser worker using local WebAssembly. Network access is disabled for student code; no Python is executed on the LearnSphere server.</p>
      </div>
    </section>
  );
}

function AnswerSources({ message }) {
  if (typeof message.sourceBased !== "boolean") return null;
  if (!message.sourceBased) {
    return (
      <div className="answer-sources general">
        {message.answerMode === "no_source"
          ? "No matching local note was found, so no general answer was generated."
          : "No matching local note was found. This answer uses Gemma’s general knowledge."}
      </div>
    );
  }

  const excerpts = Array.isArray(message.sourceExcerpts) ? message.sourceExcerpts : [];
  const citations = Array.isArray(message.sources) ? message.sources : [];
  return (
    <div className="answer-sources">
      <details className="source-details">
        <summary>Local sources used · {citations.length}</summary>
        {excerpts.length ? (
          <div className="source-excerpt-list">
            {excerpts.map((source, index) => (
              <blockquote key={source.citation + index}>
                <cite>{source.citation}</cite>
                <p>{source.text}</p>
              </blockquote>
            ))}
          </div>
        ) : (
          <ul>{citations.map((source, index) => <li key={source + index}>{source}</li>)}</ul>
        )}
      </details>
    </div>
  );
}

function AccessScreen({ mode, password, setPassword, error, busy, onSubmit, onRetry }) {
  return (
    <main className="access-screen">
      <section className="access-card">
        <img className="brand-mark access-mark" src={learnsphereMark} alt="" />
        <span className="eyebrow">LearnSphere STUDY SPACE</span>
        <h1>{mode === "checking" ? "Opening your study space" : mode === "error" ? "Couldn’t check access" : "Welcome back"}</h1>
        <p>{mode === "checking"
          ? "Checking this session…"
          : mode === "error"
            ? "The local study server didn’t respond. Check that it’s running, then try again."
            : "Enter the access password to continue."}</p>
        {mode === "error" ? (
          <button className="access-submit" type="button" onClick={onRetry}>Try again</button>
        ) : mode === "login" ? (
          <form className="access-form" onSubmit={onSubmit}>
            <label htmlFor="access-password">Access password</label>
            <input
              id="access-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={256}
              autoFocus
              required
            />
            {error && <div className="access-error" role="alert">{error}</div>}
            <button className="access-submit" type="submit" disabled={busy || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

const preferenceStorageKey = "learnsphere-study-preferences-v1";

function restorePreferences() {
  const defaults = { grade: "Class 8", subject: "General", answerLanguage: "English", sourceOnly: false };
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceStorageKey) || "null");
    if (!saved || typeof saved !== "object") return defaults;
    return {
      grade: grades.includes(saved.grade) ? saved.grade : defaults.grade,
      subject: subjects.includes(saved.subject) ? saved.subject : defaults.subject,
      answerLanguage: languages.includes(saved.answerLanguage) ? saved.answerLanguage : defaults.answerLanguage,
      sourceOnly: typeof saved.sourceOnly === "boolean" ? saved.sourceOnly : defaults.sourceOnly
    };
  } catch {
    return defaults;
  }
}

const chatStorageKey = "learnsphere-chat-session-v1";
const currentChatIdStorageKey = "learnsphere-current-chat-id-v1";
const chatHistoryStorageKey = "learnsphere-chat-history-v1";
const reminderStorageKey = "learnsphere-reminders-v1";

function createLocalId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function restoreChatSession() {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.sessionStorage.getItem(chatStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string")
      .map((message) => ({
        ...message,
        loading: false,
        hadImage: Boolean(message.hadImage || message.imageData),
        imageData: undefined,
        hadDocument: Boolean(message.hadDocument || message.documentBase64),
        documentBase64: undefined
      }));
  } catch {
    return [];
  }
}

function clearSavedChatSession() {
  try {
    window.sessionStorage.removeItem(chatStorageKey);
  } catch {}
}

function saveChatSession(messages) {
  try {
    const saved = messages
      .filter((message) => !message.loading && typeof message.content === "string" && message.content.length > 0)
      .map(({ imageData, documentBase64, ...message }) => ({
        ...message,
        loading: false,
        hadImage: Boolean(message.hadImage || imageData),
        hadDocument: Boolean(message.hadDocument || documentBase64)
      }));
    if (saved.length) window.sessionStorage.setItem(chatStorageKey, JSON.stringify(saved));
    else window.sessionStorage.removeItem(chatStorageKey);
  } catch {}
}

function restoreCurrentChatId() {
  try {
    return window.sessionStorage.getItem(currentChatIdStorageKey) || createLocalId();
  } catch {
    return createLocalId();
  }
}

function saveCurrentChatId(id) {
  try {
    window.sessionStorage.setItem(currentChatIdStorageKey, id);
  } catch {}
}

function cleanHistoryMessages(messages) {
  return messages
    .filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string" && message.content.length > 0 && !message.loading)
    .slice(-16)
    .map(({ imageData, documentBase64, ...message }) => ({
      ...message,
      loading: false,
      hadImage: Boolean(message.hadImage || imageData),
      hadDocument: Boolean(message.hadDocument || documentBase64)
    }));
}

function restoreChatHistory() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(chatHistoryStorageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.title === "string" && Number.isFinite(entry.updatedAt) && Number.isFinite(new Date(entry.updatedAt).getTime()) && Array.isArray(entry.messages))
      .map((entry) => ({ ...entry, messages: cleanHistoryMessages(entry.messages) }))
      .filter((entry) => entry.messages.length > 0)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function makeChatHistoryEntry(id, messages) {
  const savedMessages = cleanHistoryMessages(messages);
  const lastQuestion = [...savedMessages].reverse().find((message) => message.role === "user")?.content;
  return {
    id,
    title: (lastQuestion || "Study conversation").replace(/\s+/g, " ").trim().slice(0, 72),
    updatedAt: Date.now(),
    messages: savedMessages
  };
}

function restoreReminders() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(reminderStorageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((reminder) => (
      reminder &&
      typeof reminder.id === "string" &&
      typeof reminder.title === "string" &&
      typeof reminder.dueAt === "number" &&
      Number.isFinite(reminder.dueAt) &&
      typeof reminder.notified === "boolean" &&
      typeof reminder.browserNotification === "boolean"
    ));
  } catch {
    return [];
  }
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this document."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const separator = dataUrl.indexOf(",");
      if (separator < 0) reject(new Error("Could not prepare this document."));
      else resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("This image format could not be opened."));
      image.onload = () => {
        const maxSide = 2048;
        let scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare this image."));
          return;
        }
        let quality = 0.92;
        let dataUrl = "";
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          canvas.width = width;
          canvas.height = height;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length - dataUrl.indexOf(",") - 1 <= MAX_IMAGE_BASE64_CHARS) break;
          if (quality > 0.74) quality = Math.max(0.74, quality - 0.06);
          else scale *= 0.85;
        }
        resolve({
          name: file.name,
          dataUrl,
          base64: dataUrl.slice(dataUrl.indexOf(",") + 1)
        });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const accessibilityStorageKey = "learnsphere-accessibility-v1";
const mistakeNotebookStorageKey = "learnsphere-mistake-notebook-v1";
const roadmapProgressStorageKey = "learnsphere-roadmap-progress-v1";

function restoreAppZoom() {
  try {
    const saved = Number(JSON.parse(window.localStorage.getItem(accessibilityStorageKey) || "100"));
    return Number.isInteger(saved) && saved >= 80 && saved <= 150 ? saved : 100;
  } catch {
    return 100;
  }
}

function restoreMistakes() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(mistakeNotebookStorageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((mistake) => (
      mistake &&
      typeof mistake.id === "string" &&
      typeof mistake.date === "string" &&
      typeof mistake.question === "string" &&
      typeof mistake.subject === "string" &&
      typeof mistake.topic === "string" &&
      typeof mistake.studentAnswer === "string" &&
      typeof mistake.correctAnswer === "string" &&
      typeof mistake.explanation === "string"
    ));
  } catch {
    return [];
  }
}

function roadmapKey(grade, subject, language) {
  return `${grade}|${subject}|${language}`;
}

function restoreRoadmapProgress() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(roadmapProgressStorageKey) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, roadmap]) => (
      roadmap &&
      typeof roadmap.overview === "string" &&
      Array.isArray(roadmap.units) &&
      roadmap.units.every((unit) => (
        unit &&
        typeof unit.title === "string" &&
        Array.isArray(unit.lessons) &&
        unit.lessons.every((lesson) => typeof lesson === "string")
      )) &&
      roadmap.completed &&
      typeof roadmap.completed === "object" &&
      !Array.isArray(roadmap.completed) &&
      Object.values(roadmap.completed).every((date) => typeof date === "string")
    )));
  } catch {
    return {};
  }
}

function ExamWorkspace({ grade, language, onUnauthorized, onSaveMistakes }) {
  const [subject, setSubject] = useState("Science");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [grades, setGrades] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");

  async function startExam(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setExam(null);
    setAnswers({});
    setGrades({});
    setSubmitted(false);
    try {
      const response = await fetchApi("/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic: topic.trim(),
          class_level: grade,
          language,
          question_count: questionCount
        })
      }, onUnauthorized);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Could not create an exam.");
      }
      if (!Array.isArray(result.questions) || result.questions.length !== questionCount) {
        throw new Error("The generated exam was incomplete. Please try again.");
      }
      setExam(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create an exam.");
    } finally {
      setBusy(false);
    }
  }

  function answerIsCorrect(question, answer) {
    if (question.question_type === "multiple_choice") {
      return Number(answer) === question.correct_index;
    }
    if (question.question_type === "fill_blank") {
      const normalize = (value) => value.trim().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "").toLocaleLowerCase();
      return question.accepted_answers.some((accepted) => normalize(accepted) === normalize(answer));
    }
    return false;
  }

  async function submitExam(event) {
    event.preventDefault();
    if (
      !exam ||
      submitted ||
      grading ||
      exam.questions.some((_, index) => typeof answers[index] !== "string" || !answers[index].trim())
    ) return;
    setGrading(true);
    setError("");
    try {
      const reflectiveResponses = exam.questions.flatMap((question, index) => (
        question.question_type === "reflective"
          ? [{
              question_id: index,
              question: question.question,
              expected_answer: question.expected_answer,
              grading_criteria: question.grading_criteria,
              student_answer: answers[index],
              max_marks: question.max_marks
            }]
          : []
      ));
      let verifiedGrades = {};
      if (reflectiveResponses.length) {
        const response = await fetchApi("/exam/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses: reflectiveResponses })
        }, onUnauthorized);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof result.detail === "string" ? result.detail : "Could not grade reflective answers.");
        }
        if (
          !Array.isArray(result.grades) ||
          result.grades.length !== reflectiveResponses.length ||
          result.grades.some((entry) => (
            !Number.isInteger(entry.question_id) ||
            !Number.isInteger(entry.marks_awarded) ||
            typeof entry.feedback !== "string" ||
            typeof entry.correction !== "string"
          )) ||
          new Set(result.grades.map((entry) => entry.question_id)).size !== reflectiveResponses.length
        ) {
          throw new Error("Gemma returned incomplete reflective marks. Please try grading again.");
        }
        verifiedGrades = Object.fromEntries(result.grades.map((entry) => [entry.question_id, entry]));
      }
      setGrades(verifiedGrades);
      const mistakes = exam.questions.flatMap((question, index) => {
        const gradeResult = verifiedGrades[index];
        const marksAwarded = question.question_type === "reflective"
          ? gradeResult.marks_awarded
          : Number(answerIsCorrect(question, answers[index]));
        if (marksAwarded >= question.max_marks) return [];
        return [{
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          date: new Date().toISOString(),
          subject: exam.subject,
          topic: exam.topic,
          question: question.question,
          studentAnswer: question.question_type === "multiple_choice"
            ? question.options[Number(answers[index])]
            : answers[index],
          correctAnswer: question.question_type === "reflective"
            ? gradeResult.correction
            : question.expected_answer,
          explanation: question.question_type === "reflective"
            ? `${gradeResult.feedback} ${question.explanation}`
            : question.explanation,
          sources: exam.sources.map((source) => source.citation)
        }];
      });
      onSaveMistakes(mistakes);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not grade the exam. Please try again.");
    } finally {
      setGrading(false);
    }
  }

  const score = exam
    ? exam.questions.reduce(
        (total, question, index) => total + (
          question.question_type === "reflective"
            ? grades[index]?.marks_awarded || 0
            : Number(answerIsCorrect(question, answers[index] || ""))
        ),
        0
      )
    : 0;
  const totalMarks = exam?.questions.reduce((total, question) => total + question.max_marks, 0) || 0;
  const answeredAll = exam?.questions.every((_, index) => (
    typeof answers[index] === "string" && answers[index].trim()
  )) || false;
  const difficultyGroups = [
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" }
  ].map((group) => ({
    ...group,
    questions: exam?.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.difficulty === group.key) || []
  })).filter((group) => group.questions.length);

  return (
    <section className="study-card feature-page" role="tabpanel" id="exam-panel" aria-labelledby="exam-tab" tabIndex={0}>
      <div className="feature-scroll">
        <div className="feature-heading">
          <span className="welcome-kicker"><Icon name="spark" size={16} /> PRACTISE AND GROW</span>
          <h2>Exam mode</h2>
          <p>Choose a subject and topic for a balanced quiz with easy, medium, and hard questions. Gemma checks reflective answers and awards partial marks.</p>
        </div>
        <form className="exam-setup" onSubmit={startExam}>
          <label>
            <span>Subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              {subjects.filter((item) => item !== "General").map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="exam-topic-field">
            <span>Topic</span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={topicPlaceholder(grade, subject)}
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>Questions</span>
            <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
              {[3, 5, 10].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <button className="feature-primary-button" type="submit" disabled={busy || !topic.trim()}>
            {busy ? "Preparing quiz…" : exam ? "Start another quiz" : "Create quiz"}
          </button>
        </form>
        {error && <p className="feature-error" role="alert">{error}</p>}
        {busy && <p className="feature-status" role="status">Asking the local Gemma model to prepare your questions…</p>}
        {exam && (
          <div className="exam-content">
            <div className="exam-summary">
              <strong>{exam.subject} · {exam.topic}</strong>
              <span>{exam.questions.length} questions · {totalMarks} marks · {exam.class_level}</span>
            </div>
            <form onSubmit={submitExam}>
              {difficultyGroups.map((group) => (
                <section className="exam-difficulty-group" key={group.key} aria-label={`${group.label} questions`}>
                  <h3 className={`exam-difficulty-heading difficulty-${group.key}`}>
                    {group.label}<span>{group.questions.length} question{group.questions.length === 1 ? "" : "s"}</span>
                  </h3>
                  {group.questions.map(({ question, index: questionIndex }) => {
                    const answer = answers[questionIndex] || "";
                    const isCorrect = question.question_type !== "reflective" && answerIsCorrect(question, answer);
                    const gradeResult = grades[questionIndex];
                    return (
                      <fieldset className="exam-question" key={`${questionIndex}-${question.question}`} disabled={submitted || grading}>
                        <legend>
                          <span className="question-number">
                            Question {questionIndex + 1}
                            <span className="exam-question-tags">
                              <span className={`exam-type-tag type-${question.question_type}`}>
                                {question.question_type === "multiple_choice" ? "MCQ" : question.question_type === "fill_blank" ? "Fill in the blank" : "Reflective"}
                              </span>
                              <span className="exam-marks-tag">{question.max_marks} mark{question.max_marks === 1 ? "" : "s"}</span>
                            </span>
                          </span>
                          <div className="exam-question-prompt"><AnswerContent text={question.question} /></div>
                        </legend>
                        {question.question_type === "multiple_choice" ? (
                          <div className="exam-options">
                            {question.options.map((option, optionIndex) => {
                              const optionIsCorrect = submitted && optionIndex === question.correct_index;
                              const isWrongChoice = submitted && Number(answer) === optionIndex && !optionIsCorrect;
                              return (
                                <label
                                  className={"exam-option" + (optionIsCorrect ? " correct" : "") + (isWrongChoice ? " incorrect" : "")}
                                  key={`${optionIndex}-${option}`}
                                >
                                  <input
                                    type="radio"
                                    name={`exam-question-${questionIndex}`}
                                    value={optionIndex}
                                    checked={answer === String(optionIndex)}
                                    onChange={() => setAnswers((current) => ({ ...current, [questionIndex]: String(optionIndex) }))}
                                  />
                                  <div className="exam-option-text"><AnswerContent text={option} /></div>
                                  {optionIsCorrect && <strong>Correct answer</strong>}
                                  {isWrongChoice && <strong>Your answer</strong>}
                                </label>
                              );
                            })}
                          </div>
                        ) : question.question_type === "fill_blank" ? (
                          submitted ? (
                            <div className="exam-submitted-answer">
                              <strong>Your answer</strong>
                              <AnswerContent text={answer} />
                            </div>
                          ) : (
                            <div className="exam-answer-field">
                              <label htmlFor={`exam-answer-${questionIndex}`}>Your answer</label>
                              <input
                                id={`exam-answer-${questionIndex}`}
                                type="text"
                                value={answer}
                                maxLength={240}
                                autoComplete="off"
                                onChange={(event) => setAnswers((current) => ({ ...current, [questionIndex]: event.target.value }))}
                              />
                            </div>
                          )
                        ) : (
                          submitted ? (
                            <div className="exam-submitted-answer">
                              <strong>Your answer</strong>
                              <AnswerContent text={answer} />
                            </div>
                          ) : (
                            <div className="exam-answer-field">
                              <label htmlFor={`exam-answer-${questionIndex}`}>Your explanation</label>
                              <textarea
                                id={`exam-answer-${questionIndex}`}
                                value={answer}
                                maxLength={1600}
                                rows={4}
                                onChange={(event) => setAnswers((current) => ({ ...current, [questionIndex]: event.target.value }))}
                              />
                            </div>
                          )
                        )}
                        {submitted && (
                          <div className="exam-explanation">
                            {question.question_type === "reflective" ? (
                              <>
                                <strong>{gradeResult.marks_awarded} / {question.max_marks} marks · Gemma's feedback</strong>
                                <AnswerContent text={gradeResult.feedback} />
                                <strong className="exam-correction-label">Suggested correction</strong>
                                <AnswerContent text={gradeResult.correction} />
                              </>
                            ) : (
                              <>
                                <strong>{isCorrect ? "Correct" : "Review this answer"}</strong>
                                {question.question_type === "fill_blank" && !isCorrect && (
                                  <div className="exam-answer-correction">
                                    <strong>Correct answer:</strong>
                                    <AnswerContent text={question.expected_answer} />
                                  </div>
                                )}
                              </>
                            )}
                            <div className="exam-explanation-text"><AnswerContent text={question.explanation} /></div>
                          </div>
                        )}
                      </fieldset>
                    );
                  })}
                </section>
              ))}
              {!submitted && (
                <button
                  className="feature-primary-button"
                  type="submit"
                  disabled={!answeredAll || grading}
                >
                  {grading ? "Gemma is grading…" : "Finish quiz"}
                </button>
              )}
            </form>
            {submitted && (
              <section className="exam-results" aria-live="polite">
                <h3>Your result: {score} / {totalMarks} marks</h3>
                <p>{score === totalMarks ? "Excellent work — you earned every mark." : "Review the corrections below and revisit the questions saved to your Mistake Notebook."}</p>
                <h4>Where to study</h4>
                {exam.sources.length ? (
                  <ul>
                    {exam.sources.map((source) => (
                      <li key={source.citation}>
                        <strong>{source.citation}</strong>
                        <p>{source.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No matching local notes were found. Add this topic under <strong>Study buddy → Notes</strong>, or review the relevant section in your textbook.</p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MistakeNotebook({ mistakes, onRemove, onClear }) {
  return (
    <section className="study-card feature-page" role="tabpanel" id="mistakes-panel" aria-labelledby="mistakes-tab" tabIndex={0}>
      <div className="feature-scroll">
        <div className="feature-heading">
          <span className="welcome-kicker"><Icon name="book" size={16} /> LEARN FROM EACH ATTEMPT</span>
          <h2>Mistake Notebook</h2>
          <p>Your incorrect exam answers are saved on this device with the date, correction, and study references.</p>
        </div>
        {mistakes.length > 0 && (
          <button className="notebook-clear-button" type="button" onClick={onClear}>Clear notebook</button>
        )}
        {mistakes.length ? (
          <ol className="mistake-list">
            {mistakes.map((mistake) => (
              <li className="mistake-card" key={mistake.id}>
                <div className="mistake-meta">
                  <strong>{mistake.subject} · {mistake.topic}</strong>
                  <time dateTime={mistake.date}>{new Date(mistake.date).toLocaleString()}</time>
                </div>
                <div className="mistake-question"><AnswerContent text={mistake.question} /></div>
                <div className="mistake-your-answer">
                  <strong>Your answer:</strong>
                  <AnswerContent text={mistake.studentAnswer} />
                </div>
                <div className="mistake-correct-answer">
                  <strong>Correct answer:</strong>
                  <AnswerContent text={mistake.correctAnswer} />
                </div>
                <div className="mistake-explanation"><AnswerContent text={mistake.explanation} /></div>
                {mistake.sources?.length > 0 && <p className="mistake-sources"><strong>Review:</strong> {mistake.sources.join(", ")}</p>}
                <button className="mistake-remove-button" type="button" onClick={() => onRemove(mistake.id)} aria-label={`Remove mistake: ${mistake.question}`}>Remove</button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="notebook-empty">
            <h3>No mistakes saved yet</h3>
            <p>Finish a quiz in Exam mode. Any incorrect answers will appear here with an explanation and review suggestions.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function RoadmapWorkspace({ grade, language, onUnauthorized, progress, onSaveRoadmap, onToggleLesson, onStudyLesson }) {
  const [subject, setSubject] = useState("Maths");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = roadmapKey(grade, subject, language);
  const roadmap = progress[key];
  const today = localDateKey(new Date());
  const completionDates = Object.values(progress).flatMap((record) => Object.values(record.completed));
  const todayCount = completionDates.filter((date) => date === today).length;
  const completionDays = new Set(completionDates);
  let streak = 0;
  const streakDate = new Date();
  if (!completionDays.has(today)) streakDate.setDate(streakDate.getDate() - 1);
  while (completionDays.has(localDateKey(streakDate))) {
    streak += 1;
    streakDate.setDate(streakDate.getDate() - 1);
  }
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const day = localDateKey(date);
    return {
      date: day,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count: completionDates.filter((completedDate) => completedDate === day).length
    };
  });
  const weeklyMaximum = Math.max(1, ...week.map((day) => day.count));
  const completedLessons = roadmap ? Object.keys(roadmap.completed).length : 0;
  const totalLessons = roadmap
    ? roadmap.units.reduce((total, unit) => total + unit.lessons.length, 0)
    : 0;

  async function createRoadmap() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetchApi("/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, class_level: grade, language })
      }, onUnauthorized);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Could not create a roadmap.");
      }
      if (!Array.isArray(result.units) || result.units.length < 6) {
        throw new Error("The generated roadmap was incomplete. Please try again.");
      }
      onSaveRoadmap(key, result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create a roadmap.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="study-card feature-page" role="tabpanel" id="roadmap-panel" aria-labelledby="roadmap-tab" tabIndex={0}>
      <div className="feature-scroll">
        <div className="feature-heading">
          <span className="welcome-kicker"><Icon name="book" size={16} /> A STEADY PATH FORWARD</span>
          <h2>Daily progress &amp; roadmap</h2>
          <p>Follow a chapter-by-chapter study path for your class. Your roadmap and completed lessons stay on this device.</p>
        </div>
        <section className="progress-overview" aria-label="Daily study progress">
          <div className="progress-today">
            <span>TODAY</span>
            <strong>{todayCount}</strong>
            <small>lessons completed</small>
          </div>
          <div className="progress-streak">
            <strong>{streak} day{streak === 1 ? "" : "s"}</strong>
            <span>current study streak</span>
          </div>
          <div className="progress-week" aria-label="Completed lessons over the last seven days">
            {week.map((day) => (
              <div className="progress-day" key={day.date} aria-label={`${day.label}: ${day.count} lessons`}>
                <span>{day.label}</span>
                <div className="progress-bar-track"><span style={{ height: `${day.count ? Math.max(14, day.count / weeklyMaximum * 100) : 0}%` }} /></div>
                <small>{day.count || ""}</small>
              </div>
            ))}
          </div>
        </section>
        <div className="roadmap-controls">
          <label>
            <span>Roadmap subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              {["Maths", "English", "Science"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div className="roadmap-grade">{grade} · NCERT / CBSE-aligned draft</div>
          <button className="feature-primary-button" type="button" onClick={() => void createRoadmap()} disabled={busy}>
            {busy ? "Building with Gemma…" : roadmap ? "Refresh roadmap" : "Build my roadmap"}
          </button>
        </div>
        <p className="roadmap-offline-note">Generated by your local Gemma model. No online services are used. Syllabus details may vary by school; check your current school syllabus.</p>
        {error && <p className="feature-error" role="alert">{error}</p>}
        {busy && <p className="feature-status" role="status">Gemma is arranging the chapters into a learning sequence…</p>}
        {roadmap ? (
          <div className="roadmap-content">
            <div className="roadmap-summary">
              <div>
                <strong>{roadmap.subject} · {roadmap.class_level}</strong>
                <p>{roadmap.overview}</p>
              </div>
              <span>{completedLessons} / {totalLessons} lessons</span>
            </div>
            <ol className="roadmap-units">
              {roadmap.units.map((unit, unitIndex) => {
                const unitCompleted = unit.lessons.filter((lesson) => roadmap.completed[`${unit.title}::${lesson}`]).length;
                return (
                  <li className="roadmap-unit" key={`${unitIndex}-${unit.title}`}>
                    <details open={unitIndex === 0}>
                      <summary>
                        <span className="roadmap-unit-number">{String(unitIndex + 1).padStart(2, "0")}</span>
                        <span className="roadmap-unit-title">{unit.title}</span>
                        <span className="roadmap-unit-progress">{unitCompleted}/{unit.lessons.length}</span>
                      </summary>
                      <div className="roadmap-unit-body">
                        <span className="roadmap-estimate">About {unit.estimated_days} study days</span>
                        <ul>
                          {unit.lessons.map((lesson, lessonIndex) => {
                            const lessonId = `${unit.title}::${lesson}`;
                            const completedDate = roadmap.completed[lessonId];
                            return (
                              <li className="roadmap-lesson" key={lessonId}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(completedDate)}
                                    onChange={(event) => onToggleLesson(key, lessonId, event.target.checked)}
                                  />
                                  <span>{lesson}</span>
                                  {completedDate === today && <small>Done today</small>}
                                </label>
                                <button type="button" onClick={() => onStudyLesson(subject, lesson)}>
                                  Study <span className="visually-hidden">lesson {lessonIndex + 1}: {lesson}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="roadmap-checkpoint"><strong>Checkpoint:</strong> {unit.checkpoint}</p>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : !busy && (
          <div className="notebook-empty roadmap-empty">
            <h3>Your study path starts here</h3>
            <p>Choose Maths, English, or Science and ask local Gemma to prepare an ordered chapter and lesson plan for {grade}.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FlashcardsWorkspace({ grade, language, onUnauthorized }) {
  const [subject, setSubject] = useState("Science");
  const [topic, setTopic] = useState("");
  const [cardCount, setCardCount] = useState(10);
  const [deck, setDeck] = useState(null);
  const [studyCards, setStudyCards] = useState([]);
  const [ratings, setRatings] = useState({});
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentCard = studyCards[cardIndex];
  const complete = Boolean(studyCards.length && cardIndex >= studyCards.length);
  const knownCount = Object.values(ratings).filter((rating) => rating === "known").length;
  const reviewCount = Object.values(ratings).filter((rating) => rating === "review").length;

  async function createDeck(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setDeck(null);
    setStudyCards([]);
    setRatings({});
    setCardIndex(0);
    setFlipped(false);
    try {
      const response = await fetchApi("/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic: topic.trim(),
          class_level: grade,
          language,
          card_count: cardCount
        })
      }, onUnauthorized);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Could not create flashcards.");
      }
      if (!Array.isArray(result.cards) || result.cards.length !== cardCount) {
        throw new Error("The generated deck was incomplete. Please try again.");
      }
      setDeck(result);
      setStudyCards(result.cards.map((card, index) => ({ ...card, id: `${Date.now()}-${index}` })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create flashcards.");
    } finally {
      setBusy(false);
    }
  }

  function rateCard(rating) {
    if (!currentCard) return;
    setRatings((current) => ({ ...current, [currentCard.id]: rating }));
    setFlipped(false);
    setCardIndex((current) => current + 1);
  }

  function shuffleCards() {
    setStudyCards((current) => {
      const shuffled = [...current];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
      }
      return shuffled;
    });
    setRatings({});
    setCardIndex(0);
    setFlipped(false);
  }

  function retryMissedCards() {
    setStudyCards((current) => current.filter((card) => ratings[card.id] === "review"));
    setRatings({});
    setCardIndex(0);
    setFlipped(false);
  }

  function flipWithKeyboard(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setFlipped((current) => !current);
  }

  return (
    <section className="study-card feature-page" role="tabpanel" id="flashcards-panel" aria-labelledby="flashcards-tab" tabIndex={0}>
      <div className="feature-scroll flashcards-scroll">
        <div className="feature-heading">
          <span className="welcome-kicker"><Icon name="book" size={16} /> A LITTLE PRACTICE, EVERY DAY</span>
          <h2>Flashcards</h2>
          <p>Make a deck from a topic or your saved study notes. Recall the answer first, then mark what you want to revisit.</p>
        </div>
        <form className="flashcard-setup" onSubmit={(event) => void createDeck(event)}>
          <label>
            <span>Subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              {["Maths", "English", "Science"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="flashcard-topic">
            <span>Topic</span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={topicPlaceholder(grade, subject)}
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>Cards</span>
            <select value={cardCount} onChange={(event) => setCardCount(Number(event.target.value))}>
              {[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <button className="feature-primary-button" type="submit" disabled={busy || !topic.trim()}>
            {busy ? "Making your deck…" : deck ? "Create another deck" : "Make flashcards"}
          </button>
        </form>
        <p className="flashcard-offline-note">Made with Gemma on this device. No online services are used.</p>
        {error && <p className="feature-error" role="alert">{error}</p>}
        {busy && <p className="feature-status" role="status">Gemma is preparing concise question-and-answer cards…</p>}
        {deck && (
          <div className="flashcard-study">
            <div className="flashcard-deck-meta">
              <div>
                <strong>{deck.topic}</strong>
                <span>{deck.subject} · {deck.class_level}{deck.source_based ? " · from your notes" : " · general study knowledge"}</span>
              </div>
              {!complete && <button className="flashcard-shuffle" type="button" onClick={shuffleCards} aria-label="Shuffle and restart this deck">Shuffle</button>}
            </div>
            {deck.sources?.length > 0 && (
              <details className="flashcard-sources">
                <summary>Study notes used · {deck.sources.length}</summary>
                <ul>{deck.sources.map((source) => <li key={source}>{source}</li>)}</ul>
              </details>
            )}
            {complete ? (
              <section className="flashcard-complete" aria-live="polite">
                <span className="flashcard-complete-mark"><Icon name="check" size={23} /></span>
                <h3>Deck complete</h3>
                <p>{knownCount} card{knownCount === 1 ? "" : "s"} felt familiar. {reviewCount ? `${reviewCount} saved for another look.` : "You knew them all."}</p>
                {reviewCount > 0 && <button className="feature-primary-button" type="button" onClick={retryMissedCards}>Review {reviewCount} again</button>}
              </section>
            ) : currentCard ? (
              <>
                <div className="flashcard-progress-row">
                  <span>Card {cardIndex + 1} of {studyCards.length}</span>
                  <span>{knownCount} known · {reviewCount} to revisit</span>
                </div>
                <div
                  className={"flashcard-flipper" + (flipped ? " is-flipped" : "")}
                  role="button"
                  tabIndex={0}
                  aria-pressed={flipped}
                  aria-label={flipped ? "Flashcard answer. Activate to see the question." : "Flashcard question. Activate to reveal the answer."}
                  onClick={() => setFlipped((current) => !current)}
                  onKeyDown={flipWithKeyboard}
                >
                  <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-front" aria-hidden={flipped}>
                      <span className="flashcard-face-label">QUESTION</span>
                      <div className="flashcard-copy"><AnswerContent text={currentCard.question} /></div>
                      <span className="flashcard-tap-hint">Think of your answer, then tap to reveal</span>
                    </div>
                    <div className="flashcard-face flashcard-back" aria-hidden={!flipped}>
                      <span className="flashcard-face-label">ANSWER</span>
                      <div className="flashcard-copy"><AnswerContent text={currentCard.answer} /></div>
                      <span className="flashcard-tap-hint">Tap to return to the question</span>
                    </div>
                  </div>
                </div>
                <div className="flashcard-rating">
                  <button type="button" className="flashcard-review-button" onClick={() => rateCard("review")} disabled={!flipped}>Review again</button>
                  <button type="button" className="flashcard-known-button" onClick={() => rateCard("known")} disabled={!flipped}>Got it</button>
                </div>
                <div className="flashcard-progress-track" aria-label={`${cardIndex} of ${studyCards.length} cards reviewed`}>
                  <span style={{ width: `${cardIndex / studyCards.length * 100}%` }} />
                </div>
              </>
            ) : null}
          </div>
        )}
        {!deck && !busy && (
          <div className="flashcard-empty">
            <span className="flashcard-empty-rule" aria-hidden="true" />
            <h3>Small cards. Stronger recall.</h3>
            <p>Choose a topic to build a focused deck. When local notes match, Gemma uses them as its reference.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("study");
  const [appZoom, setAppZoom] = useState(restoreAppZoom);
  const [mistakes, setMistakes] = useState(restoreMistakes);
  const [roadmapProgress, setRoadmapProgress] = useState(restoreRoadmapProgress);
  const [conversationId, setConversationId] = useState(restoreCurrentChatId);
  const [chatHistory, setChatHistory] = useState(restoreChatHistory);
  const [reminders, setReminders] = useState(restoreReminders);
  const [dueReminders, setDueReminders] = useState([]);
  const [reminderClock, setReminderClock] = useState(Date.now());
  const [showReminderManager, setShowReminderManager] = useState(false);
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDue, setReminderDue] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [reminderBrowserNotification, setReminderBrowserNotification] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [historyStorageError, setHistoryStorageError] = useState("");
  const [reminderStorageError, setReminderStorageError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [savedPreferences] = useState(restorePreferences);
  const [grade, setGrade] = useState(savedPreferences.grade);
  const [subject, setSubject] = useState(savedPreferences.subject);
  const [answerLanguage, setAnswerLanguage] = useState(savedPreferences.answerLanguage);
  const [sourceOnly, setSourceOnly] = useState(savedPreferences.sourceOnly);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [messages, setMessages] = useState(restoreChatSession);
  const [pending, setPending] = useState(false);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [sourceNotice, setSourceNotice] = useState(null);
  const [sourcePending, setSourcePending] = useState(false);
  const [modelStatus, setModelStatus] = useState("checking");
  const [copiedId, setCopiedId] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const sourceInputRef = useRef(null);
  const bottomRef = useRef(null);
  const announcedRemindersRef = useRef(new Set());

  async function checkAccess() {
    setAccessChecked(false);
    setAccessCheckFailed(false);
    try {
      const response = await fetch("/auth/status", { cache: "no-store" });
      if (!response.ok) throw new Error("The access check failed.");
      const result = await response.json();
      const requiresPassword = Boolean(result.required);
      const hasSession = !requiresPassword || Boolean(result.authenticated);
      setAuthRequired(requiresPassword);
      setAuthenticated(hasSession);
      if (requiresPassword && !hasSession) {
        clearSavedChatSession();
        setConversationId(createLocalId());
        setMessages([]);
        setSourceFiles([]);
      }
      setAccessError("");
    } catch {
      setAccessCheckFailed(true);
    } finally {
      setAccessChecked(true);
    }
  }

  function expireAccess() {
    clearSavedChatSession();
    setConversationId(createLocalId());
    setMessages([]);
    setSourceFiles([]);
    setAuthenticated(false);
    setAuthRequired(true);
    setAccessChecked(true);
    setAccessError("Your sign-in expired. Please sign in again.");
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(preferenceStorageKey, JSON.stringify({ grade, subject, answerLanguage, sourceOnly }));
    } catch {}
  }, [grade, subject, answerLanguage, sourceOnly]);

  useEffect(() => {
    try {
      window.localStorage.setItem(accessibilityStorageKey, JSON.stringify(appZoom));
    } catch {
      setStorageError("Accessibility preference could not be saved in this browser.");
    }
  }, [appZoom]);

  useEffect(() => {
    try {
      window.localStorage.setItem(mistakeNotebookStorageKey, JSON.stringify(mistakes));
      setStorageError("");
    } catch {
      setStorageError("Mistake Notebook could not be saved. Check available browser storage.");
    }
  }, [mistakes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(roadmapProgressStorageKey, JSON.stringify(roadmapProgress));
    } catch {
      setStorageError("Roadmaps and daily progress could not be saved in this browser.");
    }
  }, [roadmapProgress]);

  useEffect(() => {
    void checkAccess();
  }, []);

  useEffect(() => {
    saveChatSession(messages);
    saveCurrentChatId(conversationId);
    if (!messages.some((message) => message.role === "user" && message.content.trim())) return;
    const entry = makeChatHistoryEntry(conversationId, messages);
    setChatHistory((current) => [
      entry,
      ...current.filter((saved) => saved.id !== conversationId)
    ].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 20));
  }, [messages, conversationId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(chatHistoryStorageKey, JSON.stringify(chatHistory));
      setHistoryStorageError("");
    } catch {
      setHistoryStorageError("Conversation history could not be saved. Check available browser storage.");
    }
  }, [chatHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(reminderStorageKey, JSON.stringify(reminders));
      setReminderStorageError("");
    } catch {
      setReminderStorageError("Reminders could not be saved. Check available browser storage.");
    }
  }, [reminders]);

  useEffect(() => {
    const interval = window.setInterval(() => setReminderClock(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const due = reminders.filter((reminder) => !reminder.notified && reminder.dueAt <= reminderClock);
    if (!due.length) return;
    setDueReminders((current) => {
      const currentIds = new Set(current.map((reminder) => reminder.id));
      return [...current, ...due.filter((reminder) => !currentIds.has(reminder.id))];
    });
    const firstNotifications = due.filter((reminder) => !announcedRemindersRef.current.has(reminder.id));
    for (const reminder of due) announcedRemindersRef.current.add(reminder.id);
    for (const reminder of firstNotifications) {
      if (reminder.browserNotification && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const notification = new Notification("LearnSphere reminder", { body: reminder.title, tag: reminder.id });
          notification.onclick = () => window.focus();
        } catch {
          setReminderNote("A browser notification could not be displayed. The reminder is still available in LearnSphere.");
        }
      }
    }
    const dueIds = new Set(due.map((reminder) => reminder.id));
    setReminders((current) => current.map((reminder) => (
      dueIds.has(reminder.id) ? { ...reminder, notified: true } : reminder
    )));
  }, [reminderClock, reminders]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  useEffect(() => {
    function handleNewChatShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      clearSavedChatSession();
      setConversationId(createLocalId());
      setMessages([]);
      setDraft("");
      setAttachment(null);
      setAttachmentError("");
      setCopiedId(null);
      inputRef.current?.focus();
    }

    window.addEventListener("keydown", handleNewChatShortcut);
    return () => window.removeEventListener("keydown", handleNewChatShortcut);
  }, []);

  useEffect(() => {
    if (!accessChecked || accessCheckFailed || (authRequired && !authenticated)) return;
    let active = true;
    fetchApi("/sources", { cache: "no-store" }, expireAccess)
      .then((response) => {
        if (!response.ok) throw new Error("Local notes could not be listed.");
        return response.json();
      })
      .then((result) => {
        if (active) setSourceFiles(Array.isArray(result.sources) ? result.sources : []);
      })
      .catch(() => {
        if (active) setSourceNotice({ message: "Local notes could not be listed.", error: true });
      });
    return () => { active = false; };
  }, [accessChecked, accessCheckFailed, authRequired, authenticated]);

  useEffect(() => {
    if (!accessChecked || accessCheckFailed || (authRequired && !authenticated)) return;
    let active = true;

    async function checkModel() {
      try {
        const response = await fetchApi("/health", { cache: "no-store" }, expireAccess);
        const result = await response.json().catch(() => ({}));
        if (active) setModelStatus(response.ok && result.status === "healthy" ? "ready" : "unavailable");
      } catch {
        if (active) setModelStatus("unavailable");
      }
    }

    void checkModel();
    const interval = window.setInterval(checkModel, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessChecked, accessCheckFailed, authRequired, authenticated]);

  const modelStatusLabel = modelStatus === "ready"
    ? "Local model ready"
    : modelStatus === "checking"
      ? "Checking local model"
      : "Model unavailable";
  const latestAnswerId = [...messages].reverse().find((message) => message.role === "assistant" && !message.loading && !message.failed)?.id;
  const storageWarning = storageError || historyStorageError || reminderStorageError;

  function clearChat() {
    clearSavedChatSession();
    setConversationId(createLocalId());
    setMessages([]);
    setDraft("");
    setCopiedId(null);
    setAttachment(null);
    setAttachmentError("");
    inputRef.current?.focus();
  }

  function openConversation(entry) {
    if (pending) return;
    setConversationId(entry.id);
    setMessages(cleanHistoryMessages(entry.messages));
    setDraft("");
    setAttachment(null);
    setAttachmentError("");
    setActiveTab("study");
    inputRef.current?.focus();
  }

  function clearChatHistory() {
    if (!chatHistory.length || pending) return;
    if (!window.confirm("Delete all recent conversations saved in this browser? The current chat will remain open.")) return;
    setChatHistory([]);
    setShowHistoryManager(false);
  }

  async function createReminder(event) {
    event.preventDefault();
    const title = reminderTitle.trim();
    const dueAt = new Date(reminderDue).getTime();
    if (!title) {
      setReminderError("Enter a short reminder title.");
      return;
    }
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) {
      setReminderError("Choose a time in the future.");
      return;
    }
    let browserNotification = reminderBrowserNotification;
    let note = "";
    if (browserNotification) {
      if (typeof Notification === "undefined") {
        browserNotification = false;
        note = "Browser notifications are unavailable here. The reminder will appear in LearnSphere while it is open.";
      } else {
        try {
          const permission = Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
          if (permission !== "granted") {
            browserNotification = false;
            note = "Browser notifications were not allowed. The reminder will appear in LearnSphere while it is open.";
          }
        } catch {
          browserNotification = false;
          note = "Browser notifications could not be enabled. The reminder will appear in LearnSphere while it is open.";
        }
      }
    }
    setReminders((current) => [...current, {
      id: createLocalId(),
      title,
      dueAt,
      notified: false,
      browserNotification
    }].sort((left, right) => left.dueAt - right.dueAt));
    setReminderTitle("");
    setReminderDue(localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
    setReminderBrowserNotification(false);
    setReminderError("");
    setReminderNote(note);
  }

  function removeReminder(id) {
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
    setDueReminders((current) => current.filter((reminder) => reminder.id !== id));
  }

  function changeZoom(amount) {
    setAppZoom((current) => Math.min(150, Math.max(80, current + amount)));
  }

  function saveMistakes(newMistakes) {
    if (newMistakes.length) setMistakes((current) => [...newMistakes, ...current]);
  }

  function saveRoadmap(key, generated) {
    const validLessons = new Set(
      generated.units.flatMap((unit) => unit.lessons.map((lesson) => `${unit.title}::${lesson}`))
    );
    setRoadmapProgress((current) => {
      const previous = current[key]?.completed || {};
      const completed = Object.fromEntries(
        Object.entries(previous).filter(([lessonId]) => validLessons.has(lessonId))
      );
      return { ...current, [key]: { ...generated, completed } };
    });
  }

  function toggleRoadmapLesson(key, lessonId, completed) {
    setRoadmapProgress((current) => {
      const roadmap = current[key];
      if (!roadmap) return current;
      const nextCompleted = { ...roadmap.completed };
      if (completed) nextCompleted[lessonId] = localDateKey(new Date());
      else delete nextCompleted[lessonId];
      return { ...current, [key]: { ...roadmap, completed: nextCompleted } };
    });
  }

  function studyRoadmapLesson(lessonSubject, lesson) {
    setSubject(lessonSubject);
    setDraft(`Help me study this lesson: ${lesson}`);
    setActiveTab("study");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function removeMistake(id) {
    setMistakes((current) => current.filter((mistake) => mistake.id !== id));
  }

  function clearNotebook() {
    if (window.confirm("Clear all saved mistakes from this browser?")) setMistakes([]);
  }

  function handleTabKeyDown(event) {
    const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
    const currentIndex = tabs.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  }

  async function copyAnswer(id, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (accessBusy) return;
    setAccessBusy(true);
    setAccessError("");
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: accessPassword })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not sign in.");
      setAccessPassword("");
      setAuthenticated(true);
      setAccessError("");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {}
    clearSavedChatSession();
    setMessages([]);
    setSourceFiles([]);
    setDraft("");
    setAttachment(null);
    setAuthenticated(false);
  }

  function attributionMarkdown(message) {
    if (typeof message.sourceBased !== "boolean") return "";
    if (!message.sourceBased) {
      if (message.answerMode === "no_source") {
        return "\n\n> No matching local source was found, so no general answer was generated.";
      }
      return "\n\n> No matching local source was found; this answer uses Gemma’s general knowledge.";
    }
    const citations = Array.isArray(message.sources) ? message.sources : [];
    if (!citations.length) return "\n\n> Local source excerpts were used, but no citation label was returned.";
    const excerpts = Array.isArray(message.sourceExcerpts) ? message.sourceExcerpts : [];
    const entries = citations.map((citation) => {
      const excerpt = excerpts.find((source) => source.citation === citation)?.text;
      const quote = excerpt ? "\n\n  > " + excerpt.trim().replace(/\n/g, "\n  > ") : "";
      return `- ${citation}${quote}`;
    });
    return "\n\n### Local sources\n" + entries.join("\n");
  }

  function downloadNote(message) {
    const note = "# LearnSphere Study Note\n\n" + message.content.trim() + attributionMarkdown(message) + "\n";
    const blob = new Blob([note], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "learnsphere-study-note-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadConversation() {
    const turns = messages
      .filter((message) => !message.loading && !message.failed && message.content.trim())
      .map((message) => {
        const heading = message.role === "user"
          ? `## You · ${message.classLevel || grade} · ${message.subject || subject} · ${message.answerLanguage || answerLanguage}`
          : "## LearnSphere";
        const attachmentNote = message.role === "user" && (message.imageData || message.hadImage)
          ? "\n\n_[Study image attached]_"
          : message.role === "user" && (message.documentName || message.hadDocument)
            ? `\n\n_[Study document attached${message.documentName ? `: ${message.documentName}` : ""}]_`
          : "";
        return `${heading}\n\n${message.content.trim()}${attachmentNote}${attributionMarkdown(message)}`;
      });
    if (!turns.length) return;

    const note = `# LearnSphere Study Session\n\n${turns.join("\n\n---\n\n")}\n`;
    const blob = new Blob([note], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "learnsphere-conversation-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function ask(questionText = draft, requestedSubject = subject, requestedAttachment = attachment, retryTarget = null) {
    const lastAttachmentMessage = [...messages].reverse().find((message) => (
      message.role === "user" &&
      (message.imageData || message.hadImage || message.documentBase64 || message.hadDocument)
    ));
    const previousDocument = !retryTarget && lastAttachmentMessage?.documentBase64
      ? lastAttachmentMessage
      : null;
    const currentAttachment = requestedAttachment || (previousDocument
      ? { type: "document", name: previousDocument.documentName, base64: previousDocument.documentBase64 }
      : null);
    const question = questionText.trim() || (currentAttachment?.type === "document"
      ? "Please explain this document and help me understand it."
      : currentAttachment ? "Please explain this image and help me understand it." : "");
    if (!question || pending || preparingAttachment) return;

    const requestGrade = retryTarget?.classLevel ?? grade;
    const requestLanguage = retryTarget?.answerLanguage ?? answerLanguage;
    const requestSourceOnly = retryTarget?.sourceOnly ?? sourceOnly;
    const userId = retryTarget?.userId || String(Date.now()) + "-user";
    const assistantId = retryTarget?.assistantId || String(Date.now()) + "-assistant";
    setSubject(requestedSubject);
    setDraft("");
    setAttachment(null);
    setAttachmentError("");
    setPending(true);
    if (retryTarget) {
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, content: "", loading: true, failed: false, sourceBased: undefined, answerMode: undefined, sources: [], sourceExcerpts: [] }
          : message
      )));
    } else {
      setMessages((current) => [
        ...current,
        {
          id: userId,
          role: "user",
          content: question,
          imageData: currentAttachment?.type === "image" ? currentAttachment.dataUrl : undefined,
          hadImage: currentAttachment?.type === "image",
          documentName: currentAttachment?.type === "document" ? currentAttachment.name : undefined,
          documentBase64: currentAttachment?.type === "document" ? currentAttachment.base64 : undefined,
          hadDocument: currentAttachment?.type === "document",
          classLevel: requestGrade,
          subject: requestedSubject,
          answerLanguage: requestLanguage,
          sourceOnly: requestSourceOnly
        },
        { id: assistantId, role: "assistant", content: "", loading: true }
      ]);
    }

    try {
      const response = await fetchApi("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          class_level: requestGrade,
          subject: requestedSubject,
          language: requestLanguage,
          source_only: requestSourceOnly,
          image: currentAttachment?.type === "image" ? currentAttachment.base64 : null,
          document_filename: currentAttachment?.type === "document" ? currentAttachment.name : null,
          document_base64: currentAttachment?.type === "document" ? currentAttachment.base64 : null,
          history: (() => {
            const recent = messages
              .filter((message) => !message.loading && !message.failed && message.id !== retryTarget?.userId)
              .slice(-8);
            const lastImageId = [...recent].reverse().find((message) => message.imageData)?.id;
            return recent.map(({ id, role, content, imageData }) => ({
              role,
              content,
              ...(id === lastImageId && imageData ? { image: imageData.split(",")[1] } : {})
            }));
          })()
        })
      }, expireAccess);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Please try again in a moment.");
      }
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              content: result.answer || "I couldn't create an answer. Please try again.",
              loading: false,
              sourceBased: Boolean(result.source_based),
              answerMode: result.answer_mode || (result.source_based ? "sourced" : "general"),
              sources: Array.isArray(result.sources) ? result.sources : [],
              sourceExcerpts: Array.isArray(result.source_excerpts) ? result.source_excerpts : []
            }
          : message
      )));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again in a moment.";
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, content: "I couldn't reach LearnSphere. " + detail, loading: false, failed: true }
          : message
      )));
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function retryFailed(assistantId) {
    const assistantIndex = messages.findIndex((message) => message.id === assistantId);
    const question = messages
      .slice(0, assistantIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (!question) return;

    if ((question.hadImage && !question.imageData) || (question.hadDocument && !question.documentBase64)) {
      setAttachmentError(question.hadDocument
        ? "Reattach the study document before retrying this question."
        : "Reattach the study image before retrying this question.");
      inputRef.current?.focus();
      return;
    }

    const imageData = question.imageData;
    const requestedAttachment = imageData
      ? { type: "image", name: "Study image", dataUrl: imageData, base64: imageData.split(",")[1] }
      : question.documentBase64
        ? { type: "document", name: question.documentName, base64: question.documentBase64 }
      : null;
    void ask(question.content, question.subject || subject, requestedAttachment, {
      userId: question.id,
      assistantId,
      classLevel: question.classLevel || grade,
      answerLanguage: question.answerLanguage || answerLanguage,
      sourceOnly: question.sourceOnly ?? sourceOnly
    });
  }

  async function removeSource(filename) {
    if (!window.confirm(`Remove “${filename}” from this Mac’s local notes?`)) return;
    setSourcePending(true);
    try {
      const response = await fetchApi(`/sources/${encodeURIComponent(filename)}`, { method: "DELETE" }, expireAccess);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Could not remove this note.");
      }
      setSourceFiles(Array.isArray(result.sources) ? result.sources : []);
      setSourceNotice({ message: `${filename} removed from local notes.`, error: false });
    } catch (error) {
      setSourceNotice({
        message: error instanceof Error ? error.message : "Could not remove this note.",
        error: true
      });
    } finally {
      setSourcePending(false);
    }
  }

  async function handleSourceChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!/\.(md|txt|rtf|pdf|docx)$/i.test(file.name)) {
      setSourceNotice({ message: "Choose a Markdown, text, RTF, PDF, or Word study note.", error: true });
      return;
    }
    const isBinaryDocument = /\.(pdf|docx)$/i.test(file.name);
    const maximumSize = isBinaryDocument ? 10_000_000 : 1_000_000;
    if (file.size > maximumSize) {
      setSourceNotice({ message: isBinaryDocument ? "Choose a PDF or Word file smaller than 10 MB." : "Choose a study note smaller than 1 MB.", error: true });
      return;
    }

    setSourcePending(true);
    setSourceNotice({ message: "Adding note to this Mac…", error: false });
    try {
      const upload = isBinaryDocument
        ? { filename: file.name, content_base64: await readFileAsBase64(file) }
        : { filename: file.name, content: await file.text() };
      const response = await fetchApi("/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upload)
      }, expireAccess);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Could not add this study note.");
      }
      setSourceFiles(Array.isArray(result.sources) ? result.sources : []);
      setSourceNotice({ message: `${result.added} added to local notes. Matching answers can cite it.`, error: false });
    } catch (error) {
      setSourceNotice({
        message: error instanceof Error ? error.message : "Could not add this study note.",
        error: true
      });
    } finally {
      setSourcePending(false);
    }
  }

  async function handleAttachmentChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "pdf" || extension === "docx") {
      if (file.size > 10_000_000) {
        setAttachmentError("Choose a PDF or Word file smaller than 10 MB.");
        return;
      }

      setAttachmentError("");
      setPreparingAttachment(true);
      try {
        setAttachment({
          type: "document",
          name: file.name,
          base64: await readFileAsBase64(file)
        });
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : "Could not read this document.");
      } finally {
        setPreparingAttachment(false);
      }
      return;
    }

    const supportedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!supportedTypes.includes(file.type)) {
      setAttachmentError("Choose a PNG, JPG, WebP, GIF, PDF, or DOCX file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setAttachmentError("Choose an image smaller than 12 MB.");
      return;
    }

    setAttachmentError("");
    setPreparingAttachment(true);
    try {
      const prepared = await prepareImage(file);
      if (prepared.base64.length > MAX_IMAGE_BASE64_CHARS) {
        throw new Error("This image is still too large. Try cropping it first.");
      }
      setAttachment({ ...prepared, type: "image" });
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not prepare this image.");
    } finally {
      setPreparingAttachment(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    void ask();
  }

  function handleComposerKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (!accessChecked) return <AccessScreen mode="checking" />;
  if (accessCheckFailed) return <AccessScreen mode="error" onRetry={() => void checkAccess()} />;
  if (authRequired && !authenticated) {
    return (
      <AccessScreen
        mode="login"
        password={accessPassword}
        setPassword={setAccessPassword}
        error={accessError}
        busy={accessBusy}
        onSubmit={signIn}
      />
    );
  }

  return (
    <div className="app-shell" style={{ "--app-scale": appZoom / 100 }}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={learnsphereMark} alt="" />
          <div>
            <div className="brand-name">LearnSphere</div>
            <div className="brand-caption">A friendly study companion</div>
          </div>
        </div>

        <button className="new-chat-button" onClick={clearChat} type="button">
          <Icon name="plus" size={17} />
          <span>New chat</span>
          <span className="shortcut">⌘ K</span>
        </button>
        <button className="sidebar-reminder-button" type="button" onClick={() => setShowReminderManager(true)}>
          <Icon name="bell" size={16} />
          <span>Study reminders</span>
          {reminders.length > 0 && <span className="reminder-count">{reminders.length}</span>}
        </button>

        <div className="side-section-label">YOUR SPACE</div>
        <div className="side-nav-item active">
          <Icon name="book" size={17} />
          <span>Study buddy</span>
          <span className="nav-dot" />
        </div>

        <div className="recent-heading">
          <div className="side-section-label recent-label">RECENT HISTORY</div>
          {chatHistory.length > 0 && (
            <button
              className="history-clear-button"
              type="button"
              onClick={clearChatHistory}
              disabled={pending}
              title="Delete recent conversation history"
            >Clear</button>
          )}
        </div>
        <div className="history-list" aria-label="Recent conversations">
          {chatHistory.length ? chatHistory.map((entry) => (
            <button
              className={"history-entry" + (entry.id === conversationId ? " current" : "")}
              key={entry.id}
              type="button"
              onClick={() => openConversation(entry)}
              disabled={pending}
              aria-label={`Open conversation: ${entry.title}`}
            >
              <span className="history-entry-title">{entry.title}</span>
              <time dateTime={new Date(entry.updatedAt).toISOString()}>
                {new Date(entry.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </time>
            </button>
          )) : (
            <p className="history-empty">Your saved conversations will appear here.</p>
          )}
        </div>

        <div className="sidebar-spacer" />
        <div className="offline-card">
          <div className="offline-topline">
            <span className={"online-dot " + modelStatus} />
            <span>{modelStatus === "ready" ? "LOCAL MODEL READY" : modelStatus === "checking" ? "CHECKING LOCAL MODEL" : "LOCAL MODEL OFFLINE"}</span>
          </div>
          <div className="model-name">Gemma 4 E4B</div>
          <div className="model-caption">{modelStatus === "ready" ? "Local with Ollama · offline" : modelStatus === "checking" ? "Checking your local model" : "Start Ollama and try again"}</div>
        </div>
        <div className="sidebar-footer"><Icon name="leaf" size={15} /> Learn at your own pace</div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="page-title">
            <span className="eyebrow">YOUR STUDY SPACE</span>
            <h1>{activeTab === "study" ? "Study buddy" : activeTab === "exam" ? "Exam mode" : activeTab === "mistakes" ? "Mistake Notebook" : activeTab === "roadmap" ? "Roadmap" : activeTab === "python" ? "Python coding" : "Flashcards"}</h1>
          </div>
          <div className="topbar-controls">
            <button className="history-open-button" type="button" onClick={() => setShowHistoryManager(true)}>
              <Icon name="book" size={15} />
              <span>History</span>
            </button>
            <button className="reminder-open-button" type="button" onClick={() => setShowReminderManager(true)}>
              <Icon name="bell" size={15} />
              <span>Reminders</span>
              {reminders.length > 0 && <span className="reminder-count">{reminders.length}</span>}
            </button>
            <input
              ref={sourceInputRef}
              className="hidden-file-input"
              type="file"
              accept=".md,.txt,.rtf,.pdf,.docx,text/markdown,text/plain,application/rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleSourceChange}
              aria-label="Choose a local Markdown, text, RTF, PDF, or Word study note"
            />
            <details className="source-library">
              <summary className="source-add-button" title="View local notes">
                <Icon name="book" size={15} />
                <span>Notes {sourceFiles.length}</span>
              </summary>
              <div className="source-library-panel">
                <div className="source-library-heading">
                  <strong>Local study notes</strong>
                  <button type="button" onClick={() => sourceInputRef.current?.click()} disabled={sourcePending}>
                    {sourcePending ? "Working…" : "+ Add note"}
                  </button>
                </div>
                <label className="source-only-toggle">
                  <input
                    type="checkbox"
                    checked={sourceOnly}
                    onChange={(event) => setSourceOnly(event.target.checked)}
                  />
                  <span>
                    <strong>Use only local notes</strong>
                    <small>Skip a general answer when no note matches.</small>
                  </span>
                </label>
                {sourceFiles.length ? (
                  <ul>
                    {sourceFiles.map((filename) => (
                      <li key={filename}>
                        <span title={filename}>{filename}</span>
                        <button
                          className="source-remove-button"
                          type="button"
                          onClick={() => void removeSource(filename)}
                          disabled={sourcePending}
                          aria-label={`Remove ${filename} from local notes`}
                        >Remove</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No notes yet. Add a Markdown, text, RTF, PDF, or Word file to use it as a local source.</p>
                )}
              </div>
            </details>
            <label className="control-pill">
              <span>Class</span>
              <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                {grades.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="control-pill subject-control">
              <span>Subject</span>
              <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                {subjects.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="control-pill language-control">
              <span>Answer in</span>
              <select value={answerLanguage} onChange={(event) => setAnswerLanguage(event.target.value)}>
                {languages.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="local-status" aria-live="polite"><span className={"online-dot " + modelStatus} /> {modelStatusLabel}</div>
            {authRequired && <button className="sign-out-button" type="button" onClick={() => void signOut()}>Sign out</button>}
            <button
              className="conversation-export"
              type="button"
              onClick={downloadConversation}
              disabled={pending || !messages.some((message) => !message.loading && !message.failed && message.content.trim())}
              aria-label="Save this conversation as a Markdown study note"
              title="Save conversation"
            >
              <Icon name="download" size={15} />
              <span>Save chat</span>
            </button>
          </div>
        </header>

        <div className="workspace-nav-row">
          <nav className="workspace-tabs" role="tablist" aria-label="Study tools" onKeyDown={handleTabKeyDown}>
            <button
              id="study-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "study"}
              aria-controls="study-panel"
              className={activeTab === "study" ? "active" : ""}
              onClick={() => setActiveTab("study")}
            >Study buddy</button>
            <button
              id="exam-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "exam"}
              aria-controls="exam-panel"
              className={activeTab === "exam" ? "active" : ""}
              onClick={() => setActiveTab("exam")}
            >Exam mode</button>
            <button
              id="mistakes-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "mistakes"}
              aria-controls="mistakes-panel"
              className={activeTab === "mistakes" ? "active" : ""}
              onClick={() => setActiveTab("mistakes")}
            >Mistake Notebook {mistakes.length > 0 && <span className="mistake-count">{mistakes.length}</span>}</button>
            <button
              id="roadmap-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "roadmap"}
              aria-controls="roadmap-panel"
              className={activeTab === "roadmap" ? "active" : ""}
              onClick={() => setActiveTab("roadmap")}
            >Roadmap</button>
            <button
              id="flashcards-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "flashcards"}
              aria-controls="flashcards-panel"
              className={activeTab === "flashcards" ? "active" : ""}
              onClick={() => setActiveTab("flashcards")}
            >Flashcards</button>
            <button
              id="python-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "python"}
              aria-controls="python-panel"
              className={activeTab === "python" ? "active" : ""}
              onClick={() => setActiveTab("python")}
            >Python</button>
          </nav>
          <div className="accessibility-controls" role="group" aria-label="Screen size">
            <span>Screen size</span>
            <button type="button" onClick={() => changeZoom(-10)} disabled={appZoom <= 80} aria-label="Decrease screen size">−</button>
            <output aria-live="polite" aria-label={`Screen size ${appZoom} percent`}>{appZoom}%</output>
            <button type="button" onClick={() => changeZoom(10)} disabled={appZoom >= 150} aria-label="Increase screen size">+</button>
          </div>
        </div>
        {storageWarning && <p className="storage-warning" role="alert">{storageWarning}</p>}

        <section
          className="study-card"
          id="study-panel"
          role="tabpanel"
          aria-labelledby="study-tab"
          tabIndex={0}
          hidden={activeTab !== "study"}
        >
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <div className="welcome-kicker"><Icon name="spark" size={16} /> YOUR LEARNING SPACE</div>
                <h2>What would you like to <span>learn today?</span></h2>
                <p className="welcome-description">Ask a question from your class, or choose a study tool to keep your learning on track.</p>

                <div className="prompt-grid">
                  {studyShortcuts.map((shortcut) => (
                    <button
                      className="prompt-card"
                      key={shortcut.tab}
                      onClick={() => setActiveTab(shortcut.tab)}
                      type="button"
                    >
                      <span className="prompt-icon"><Icon name={shortcut.icon} size={16} /></span>
                      <span className="prompt-category">{shortcut.category}</span>
                      <strong>{shortcut.title}</strong>
                      <span className="prompt-description">{shortcut.description}</span>
                      <span className="prompt-arrow"><Icon name="arrow" size={16} /></span>
                    </button>
                  ))}
                </div>

                <div className="welcome-note">
                  <span className="note-mark"><Icon name="leaf" size={17} /></span>
                  <span><strong>Made for your learning routine.</strong> Pick a tool above or ask your own question below.</span>
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <article className={"message-row " + message.role} key={message.id}>
                    <div className={"message-avatar " + message.role}>
                      {message.role === "assistant" ? <Icon name="spark" size={17} /> : "Y"}
                    </div>
                    <div className="message-main">
                      <div className="message-meta">
                        <strong>{message.role === "assistant" ? "LearnSphere" : "YOU"}</strong>
                        {message.role === "assistant" && !message.loading && !message.failed && (
                          <span>Local answer</span>
                        )}
                      </div>
                      <div className={"message-content" + (message.failed ? " failed" : "")}>
                        {message.loading ? (
                          <div className="thinking-state" aria-label="LearnSphere is thinking">
                            <span className="thinking-dots"><i /><i /><i /></span>
                            <span>Thinking through your question…</span>
                          </div>
                        ) : message.role === "assistant" ? (
                          <>
                            <AnswerContent text={message.content} />
                            <AnswerSources message={message} />
                          </>
                        ) : (
                          <>
                            {message.imageData && <img className="message-image" src={message.imageData} alt="Attached study material" />}
                            {message.hadImage && !message.imageData && (
                              <p className="restored-image-note">This photo was not saved across refresh. Reattach it to ask a follow-up about the image.</p>
                            )}
                            {message.documentName && (
                              <p className="message-document">Document attached · {message.documentName}</p>
                            )}
                            {message.hadDocument && !message.documentBase64 && (
                              <p className="restored-image-note">This document was not saved across refresh. Reattach it to ask a follow-up about the document.</p>
                            )}
                            <p className="user-question">{message.content}</p>
                          </>
                        )}
                      </div>
                      {message.role === "assistant" && message.failed && (
                        <div className="message-actions">
                          <button type="button" onClick={() => retryFailed(message.id)} disabled={pending}>
                            <Icon name="send" size={14} />
                            Try again
                          </button>
                        </div>
                      )}
                      {message.role === "assistant" && !message.loading && !message.failed && (
                        <div className="message-actions">
                          <button type="button" onClick={() => void copyAnswer(message.id, message.content)}>
                            <Icon name={copiedId === message.id ? "check" : "copy"} size={14} />
                            {copiedId === message.id ? "Copied" : "Copy answer"}
                          </button>
                          <button type="button" onClick={() => downloadNote(message)} aria-label="Save this answer as a Markdown note">
                            <Icon name="download" size={14} />
                            Save note
                          </button>
                          {message.id === latestAnswerId && !pending && (
                            <div className="followup-actions" aria-label="Follow-up suggestions">
                              <button type="button" onClick={() => void ask("Explain that more simply, using short sentences.")}>Explain simpler</button>
                              <button type="button" onClick={() => void ask("Give me an everyday example of this topic.")}>Give an example</button>
                              <button type="button" onClick={() => void ask("Quiz me with one question about this topic. Wait for my answer.")}>Quiz me</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="composer-area">
            {sourceNotice && (
              <p className={"source-notice" + (sourceNotice.error ? " error" : "")} role={sourceNotice.error ? "alert" : "status"}>
                {sourceNotice.message}
              </p>
            )}
            {messages.length === 0 && (
              <div className="composer-hint">
                <span>Tip: press <kbd>Enter</kbd> to send</span>
                <span>Shift + Enter for a new line</span>
              </div>
            )}
            <form className="composer" onSubmit={submit}>
              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleAttachmentChange}
                aria-label="Choose an image, PDF, or Word document"
              />
              {attachment && (
                <div className="attachment-preview">
                  {attachment.type === "image"
                    ? <img src={attachment.dataUrl} alt="Study image preview" />
                    : <div className="document-attachment-icon" aria-hidden="true">{attachment.name.split(".").pop()?.toUpperCase()}</div>}
                  <div className="attachment-details">
                    <strong>{attachment.type === "image" ? "Study image attached" : "Study document attached"}</strong>
                    <span>{attachment.name}</span>
                  </div>
                  <button
                    className="remove-attachment"
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remove attachment"
                  >×</button>
                </div>
              )}
              {attachmentError && <p className="attachment-error" role="alert">{attachmentError}</p>}
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKey}
                placeholder={pending ? "LearnSphere is thinking…" : "Ask a question or paste a problem…"}
                rows={2}
                maxLength={2000}
                aria-label="Your question"
                disabled={pending}
              />
              <div className="composer-bottom">
                <span className="composer-note"><Icon name="leaf" size={15} /> Conversation saved in this browser</span>
                <div className="composer-tools">
                  <button
                    className="attach-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pending || preparingAttachment}
                    aria-label="Attach an image, PDF, or Word document"
                    title="Attach an image, PDF, or Word document"
                  >
                    {preparingAttachment ? <span className="small-spinner" /> : <Icon name="paperclip" size={16} />}
                  </button>
                  <span className="character-count">{draft.length}/2000</span>
                  <button
                    className="send-button"
                    type="submit"
                    disabled={(!draft.trim() && !attachment) || pending || preparingAttachment}
                    aria-label={preparingAttachment ? "Preparing attachment" : "Send question"}
                  >
                    {pending || preparingAttachment ? <span className="button-spinner" /> : <Icon name="send" size={17} />}
                  </button>
                </div>
              </div>
            </form>
            <p className="fine-print">LearnSphere can make mistakes. Use it as a learning guide and check important facts with your textbook.</p>
          </div>
        </section>
        <div className="workspace-panel" hidden={activeTab !== "exam"}>
          <ExamWorkspace
            grade={grade}
            language={answerLanguage}
            onUnauthorized={expireAccess}
            onSaveMistakes={saveMistakes}
          />
        </div>
        <div className="workspace-panel" hidden={activeTab !== "mistakes"}>
          <MistakeNotebook mistakes={mistakes} onRemove={removeMistake} onClear={clearNotebook} />
        </div>
        <div className="workspace-panel" hidden={activeTab !== "roadmap"}>
          <RoadmapWorkspace
            grade={grade}
            language={answerLanguage}
            onUnauthorized={expireAccess}
            progress={roadmapProgress}
            onSaveRoadmap={saveRoadmap}
            onToggleLesson={toggleRoadmapLesson}
            onStudyLesson={studyRoadmapLesson}
          />
        </div>
        <div className="workspace-panel" hidden={activeTab !== "flashcards"}>
          <FlashcardsWorkspace
            grade={grade}
            language={answerLanguage}
            onUnauthorized={expireAccess}
          />
        </div>
        <div className="workspace-panel" hidden={activeTab !== "python"}>
          <PythonWorkspace />
        </div>
      </main>
      {dueReminders.length > 0 && (
        <div className="due-reminder-banner" role="status" aria-live="polite">
          <Icon name="bell" size={17} />
          <span>
            <strong>Study reminder</strong>
            {dueReminders.length === 1 ? ` · ${dueReminders[0].title}` : ` · ${dueReminders.length} reminders are due`}
          </span>
          <button type="button" onClick={() => setShowReminderManager(true)}>View</button>
          <button className="due-reminder-dismiss" type="button" aria-label="Dismiss reminder alert" onClick={() => setDueReminders([])}>×</button>
        </div>
      )}
      {showHistoryManager && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowHistoryManager(false);
        }}>
          <section
            className="history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowHistoryManager(false);
            }}
          >
            <div className="reminder-dialog-heading">
              <div>
                <span className="welcome-kicker"><Icon name="book" size={15} /> YOUR RECENT STUDY SESSIONS</span>
                <h2 id="history-dialog-title">Conversation history</h2>
              </div>
              {chatHistory.length > 0 && (
                <button
                  className="history-clear-button history-dialog-clear-button"
                  type="button"
                  onClick={clearChatHistory}
                  disabled={pending}
                >Clear history</button>
              )}
              <button type="button" className="reminder-close" onClick={() => setShowHistoryManager(false)} aria-label="Close conversation history">×</button>
            </div>
            <div className="history-dialog-list">
              {chatHistory.length ? chatHistory.map((entry) => (
                <button
                  className="history-dialog-entry"
                  key={entry.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    openConversation(entry);
                    setShowHistoryManager(false);
                  }}
                >
                  <span className="history-entry-title">{entry.title}</span>
                  <time dateTime={new Date(entry.updatedAt).toISOString()}>{new Date(entry.updatedAt).toLocaleString()}</time>
                </button>
              )) : (
                <p className="history-empty">Your saved conversations will appear here after you ask a question.</p>
              )}
            </div>
            <p className="reminder-footnote">Up to 20 recent conversations are saved in this browser. Attachments are not stored.</p>
          </section>
        </div>
      )}
      {showReminderManager && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowReminderManager(false);
        }}>
          <section
            className="reminder-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowReminderManager(false);
            }}
          >
            <div className="reminder-dialog-heading">
              <div>
                <span className="welcome-kicker"><Icon name="bell" size={15} /> YOUR STUDY ROUTINE</span>
                <h2 id="reminder-dialog-title">Study reminders</h2>
              </div>
              <button type="button" className="reminder-close" onClick={() => setShowReminderManager(false)} aria-label="Close reminders">×</button>
            </div>
            <form className="reminder-form" onSubmit={(event) => void createReminder(event)}>
              <label>
                <span>What should you remember?</span>
                <input autoFocus value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} maxLength={100} placeholder="For example, revise chapter 3" required />
              </label>
              <label>
                <span>When?</span>
                <input type="datetime-local" value={reminderDue} min={localDateTimeValue(new Date(Date.now() + 60 * 1000))} onChange={(event) => setReminderDue(event.target.value)} required />
              </label>
              <label className="reminder-notification-option">
                <input type="checkbox" checked={reminderBrowserNotification} onChange={(event) => setReminderBrowserNotification(event.target.checked)} />
                <span>Also show a browser notification when available</span>
              </label>
              <button className="feature-primary-button" type="submit">Add reminder</button>
            </form>
            {reminderError && <p className="feature-error" role="alert">{reminderError}</p>}
            {reminderNote && <p className="reminder-note" role="status">{reminderNote}</p>}
            <div className="reminder-list">
              <h3>Upcoming</h3>
              {reminders.length ? reminders.slice().sort((left, right) => left.dueAt - right.dueAt).map((reminder) => (
                <div className={"reminder-item" + (reminder.dueAt <= Date.now() ? " due" : "")} key={reminder.id}>
                  <span className="reminder-item-icon"><Icon name={reminder.dueAt <= Date.now() ? "check" : "bell"} size={15} /></span>
                  <span className="reminder-item-copy">
                    <strong>{reminder.title}</strong>
                    <time dateTime={new Date(reminder.dueAt).toISOString()}>{new Date(reminder.dueAt).toLocaleString()}</time>
                  </span>
                  <button type="button" onClick={() => removeReminder(reminder.id)} aria-label={`Mark ${reminder.title} done and remove reminder`}>Done</button>
                </div>
              )) : (
                <p className="reminder-empty">No reminders yet. Add one for a study session, revision, or a break.</p>
              )}
            </div>
            <p className="reminder-footnote">Reminders are saved on this device. In-app alerts appear while LearnSphere is open; browser alerts require permission.</p>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
