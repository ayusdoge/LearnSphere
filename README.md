# LearnSphere — One AI Tutor. Endless Learning Possibilities.

LearnSphere is an AI-powered educational platform designed to make quality education accessible to everyone, especially students in rural and underserved areas where reliable internet connectivity is limited.

It brings a single intelligent AI learning assistant that helps students learn, understand, practise, and explore a wide range of subjects and skills through one unified platform.

Whether a student needs help understanding a difficult concept, preparing notes, solving questions, learning programming, practising for exams, or exploring a new subject, LearnSphere aims to provide personalised guidance in one place.

### Key Features

- **AI Learning Assistant:** A single intelligent assistant for questions, explanations, and personalised learning.
- **Concept Explanation:** Understand complex topics through simple, step-by-step explanations and examples.
- **Smart Notes:** Generate summaries, revision notes, and structured study material.
- **Practice & Quizzes:** Create topic-based questions, MCQs, and practice tests.
- **Python coding workspace:** Write and run Python 3 in a browser-based editor with program input, output, error messages, and a resettable example. Python is the first supported language.
- **Study Material Assistance:** Interact with textbooks, PDFs, and other learning resources.
- **Personalised Learning:** Adapt explanations and learning support to individual student needs.
- **Offline Accessibility:** Designed to support local AI inference and offline learning through locally available models and resources.

### Vision

We believe quality education should not be limited by geographical location, financial circumstances, or internet connectivity.

With LearnSphere, our goal is to bring an intelligent learning companion to every student, making education more accessible, inclusive, and independent.

**One assistant. Every subject. Learning without limits.**

---

# LearnSphere

A local AI study companion for Indian students. It uses Gemma 4 E4B through Ollama and is designed to run without cloud inference or external APIs.

## Start the app

1. Open Ollama and make sure `gemma4:e4b` is installed. In Terminal, `ollama list` should show it.
2. Double-click `start.command` in this folder.
3. Keep the Terminal window open while using LearnSphere. The script opens the study page at <http://127.0.0.1:8000/ui/>.

If LearnSphere is already running, `start.command` opens the page without starting a second server. It checks Ollama and the app through `127.0.0.1` only.

### First-time setup

Install dependencies once before using the app:

```sh
python3 --version  # Python 3.11 or newer
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
npm run build
```

Dependency installation needs access to the package registries (or pre-populated local caches). After setup, LearnSphere's runtime uses local files, FastAPI, and Ollama; study requests do not use online APIs.

## Password-protected public demo

Use this only when you want invited people to reach LearnSphere over the internet. Public access needs an internet connection, but question answering still runs on Ollama and Gemma on this Mac.

1. Stop any LearnSphere server already running on port 8000.
2. Open Ollama, then double-click `start-public.command` and enter a shared password between 12 and 256 characters. Keep its Terminal window open.
3. Put a trusted HTTPS access tunnel in front of `127.0.0.1:8000`, then share its HTTPS address and the password with your invited users.

Do not expose `start.command` or forward port 8000 directly. The public start script refuses to start if another LearnSphere server is already running. Public sessions expire after 12 hours; sign-in attempts are limited, browser sessions use HttpOnly and SameSite cookies, and mutating requests must come from the LearnSphere page. `/docs` and the OpenAPI schema are disabled. The password is kept in the server process environment and is not saved in the project.

Anyone with the shared password can ask questions and manage the local source notes. Use notes you are comfortable sharing. Visitors' prompts and attached images travel over the internet to this Mac; Gemma inference remains on this Mac and does not use a cloud model. Stop the Terminal server and the HTTPS tunnel when the demo ends.

## Use the study page

- Choose a class, subject, and response language.
- Type a question, select a starter prompt, or attach a PNG, JPG, WebP, or GIF study image, PDF, or Word `.docx` document (up to 10 MB per document).
- Image questions are sent at higher detail for reading; for math, LearnSphere checks exact digits and superscripts and will ask you to clarify symbols it cannot read confidently.
- Continue with follow-up questions or use **Explain simpler**, **Give an example**, or **Quiz me** under an answer.
- Use **Save note** to download an answer as a Markdown file.
- Use the **− / + Screen size** controls to resize the app; the setting is saved in this browser.
- **Exam mode** uses the local Gemma model through Ollama to create subject- and topic-based quizzes grouped by easy, medium, and hard, with multiple-choice, fill-in-the-blank, and reflective questions. Multiple-choice and fill-in-the-blank answers are marked locally; reflective responses are sent to local Gemma for rubric-based partial marks, feedback, and a suggested correction. No cloud model or online grading API is used. Incorrect and partially correct answers are saved to the Mistake Notebook, and matching local study notes are shown for review.
- **Flashcards** builds class-, subject-, and topic-specific question-and-answer decks with Gemma. Flip each card, mark it as known or needing review, shuffle a deck, and revisit missed cards; matching local study notes can ground the cards.
- **Study reminders** lets you schedule local study prompts. Due reminders appear in LearnSphere while it is open; optional browser notifications need permission. Reminder schedules stay in this browser.
- **Conversation history** keeps up to 20 recent chats in this browser so you can reopen them from the sidebar. Attachments are not stored in history.
- Incorrect and partially correct exam answers are saved with their date, correction, and explanation in the **Mistake Notebook**. The notebook and accessibility preference stay in this browser and can be cleared there.
- **Daily progress & roadmap** asks the local Gemma model to draft an NCERT/CBSE-aligned chapter sequence for Maths, English, or Science in Classes 6–12. Mark lessons as complete to track daily totals and study streaks; progress and roadmaps stay in this browser.
- **Python** provides a beginner-friendly coding section. Edit the example, enter values for `input()`, and run your program to see its output or traceback. Your code is saved in this browser.

The Python workspace runs Pyodide (Python compiled to WebAssembly) in a browser worker on the student's device. Its runtime files are bundled into the LearnSphere frontend, so running Python does not need internet, Ollama, or a backend request. Student code is not sent to LearnSphere's server or Gemma. Network access is disabled in the Python worker; code runs for at most 10 seconds per run. This is a lightweight Python editor and runner, not a full IDE, and it currently supports the standard library only (no `pip` installs).

Math equations, fractions, and inequalities are rendered by the locally bundled KaTeX library across chat, exams, flashcards, and the Mistake Notebook; KaTeX requires no internet connection. In exam mode, rendering covers question prompts, MCQ options, submitted answers, expected answers, explanations, and Gemma's grading feedback and corrections. Standard LaTeX delimiters are supported, along with common undelimited expressions such as `3^4 / 3^7`.

Conversation history is stored in this browser and remains when you choose **New chat** or close the tab. Uploaded images and documents are kept only in memory while the page is open, are not saved across page refreshes, and are processed locally; reattach one to ask a follow-up after refreshing.

Attached PDFs and `.docx` files are temporarily read on this Mac, relevant text excerpts are sent to Gemma through Ollama, and the temporary upload is discarded. PDFs can use on-device OCR when they contain scanned pages.

## Local source notes

LearnSphere can ground answers in local Markdown, plain-text, RTF, PDF, and Word `.docx` notes. Use **Notes** in the study page to view or remove saved notes, or add a `.md`, `.txt`, `.rtf`, `.pdf`, or `.docx` file you are allowed to use. You can also place files under `backend/sources/`. Matching excerpts stay on this Mac, go only to Ollama, and are shown under the answer with the file and section name. When no local note matches, LearnSphere labels the reply as general Gemma knowledge. See `backend/LOCAL_SOURCES.md` for limits. RTF and Word text are extracted with macOS `textutil`; selectable PDF text is extracted with PDFKit. Scanned PDFs use on-device Vision OCR for up to 50 pages. PDFs and Word files can be up to 10 MB; text, Markdown, and RTF notes can be up to 1 MB.

## What runs locally

The browser sends study requests to FastAPI at `127.0.0.1:8000`. FastAPI searches the local notes folder, extracts attached documents locally, and sends the question, matching excerpts, and any image to Ollama at `localhost:11434`, using `gemma4:e4b`. The app does not call a cloud model or external API. The Python coding workspace runs locally in the browser and does not use this API.

- Study page: `/ui/`
- API health: `/health`
- API documentation routes: disabled
- Ask endpoint: `POST /ask`
- Exam generation: `POST /exam`
- Reflective exam grading: `POST /exam/grade` (local Gemma through Ollama)
- Flashcard generation: `POST /flashcards` (local Gemma through Ollama)
- Roadmap generation: `POST /roadmap` (local Gemma through Ollama)
- Local source notes: `GET /sources`, `POST /sources`

## Rebuild the React page

After changing files in `frontend/src/`, run:

```sh
cd /Users/ayus/LearnSphere/frontend
npm run build
```

The build uses the locally installed React and Vite packages. The finished page is served by FastAPI at `/ui/`.

For frontend development, run `npm run dev` from `frontend/`; Vite uses `127.0.0.1:5173` and proxies the app's API routes to the FastAPI server on port 8000.