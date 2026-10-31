# LearnSphere

### A local-first study companion for Classes 6–12

LearnSphere brings a personal AI tutor, revision tools, and a Python workspace
into one calm, student-friendly app. It is designed for learners who need
useful study support even when reliable internet access is limited.

**The idea is simple:** ask questions, study from your own materials, practise
what you learned, and keep your progress together in one place.

> **Built for Hacktoberfest PS8.** LearnSphere uses Gemma 4 E4B through Ollama
> on your Mac. Study prompts are processed locally—there is no cloud AI service
> or online inference API.

## What makes LearnSphere useful?

- **Learn:** Ask questions and get explanations tailored to a class, subject,
  and language.
- **Study from your materials:** Add notes or attach a PDF, Word document, or
  image. LearnSphere can find relevant passages and show where they came from.
- **Practise:** Generate quizzes and flashcards, then review mistakes.
- **Build a routine:** Set reminders, follow a learning roadmap, and see your
  progress.
- **Try coding:** Write and run Python directly in the browser.
- **Keep maths readable:** Equations are rendered with KaTeX, which is bundled
  with the app and works offline.

## A quick demo for judges

Once LearnSphere is running, try this short walkthrough:

1. Ask the Study Buddy a question for a class and subject.
2. Add a study note or PDF, then ask a question that can be answered from it.
   Try **Source Only** mode to see how the app handles a question the material
   does not answer.
3. Generate an exam or flashcards for a topic and review the results.
4. Open the Python section, edit the example, and run it.
5. Create a roadmap or reminder and see how study progress is tracked.

AI-generated explanations and questions can be imperfect or take time to
generate. Review generated material before relying on it for graded work.

## Features

| Area | What students can do |
| --- | --- |
| **Study Buddy** | Ask questions, request simpler explanations or examples, and continue with follow-up questions. |
| **Study Notes** | Search local Markdown, text, RTF, PDF, and Word documents; see citations to matching files and sections. |
| **Exam Mode** | Practise with easy, medium, and hard multiple-choice, fill-in-the-blank, and reflective questions. |
| **Mistake Notebook** | Revisit incorrect or partially correct answers with feedback and corrections. |
| **Flashcards** | Create topic-focused decks, flip cards, mark them for review, and revisit missed cards. |
| **Roadmap & Progress** | Draft a Maths, English, or Science learning path for Classes 6–12 and track completed lessons. |
| **Reminders & History** | Keep study reminders and up to 20 recent conversations in this browser. |
| **Python Workspace** | Run Python 3 locally with input, output, and error messages. |

## Get started on macOS

You do not need to be a developer to use LearnSphere. Follow these steps in
order; the Gemma download can take a while.

### 1. Install the required apps

- Install [Ollama](https://ollama.com/) and open it.
- Install Python **3.11 or newer**. Check your version in Terminal with
  `python3 --version`.
- Install Node.js **20.19+ or 22.12+**. Check with `node --version`.

LearnSphere uses macOS tools to extract some PDF and Word documents.

### 2. Download the local AI model

Open Terminal and download Gemma through Ollama:

```sh
ollama pull gemma4:e4b
ollama list
```

The model download is several gigabytes and may take a while. It is used by
LearnSphere on your Mac; it is not a cloud service.

### 3. Install LearnSphere's dependencies

Open Terminal in the LearnSphere project folder, then run:

```sh
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
npm run build
cd ..
```

These setup steps download software packages. Internet access may be needed for
the initial setup; after setup, the app is designed to work offline.

### 4. Start studying

Double-click `start.command` in the project folder. Keep the Terminal window
open while using LearnSphere. The app opens at
<http://127.0.0.1:8000/ui/>.

If Ollama is not running, open the Ollama app and try again. LearnSphere runs
on this Mac and does not need an internet connection for local study requests.

## Your data and offline use

- Study questions, attached images, and relevant note excerpts are sent to
  Ollama on this Mac at `localhost:11434`, not to an online AI API.
- Chat history, reminders, roadmap progress, exam mistakes, and Python code are
  saved in this browser. They remain on this device unless you clear browser
  storage.
- Attachments are held in memory while the page is open. After refreshing,
  attach the file again if you want to ask about it.
- Python runs in a browser worker using bundled Pyodide. Code is not sent to
  the server or Gemma; network access is disabled and each run is limited to
  10 seconds. The workspace supports the standard library, not `pip` packages.
- The app, KaTeX, and Python runtime are bundled locally. Downloading the model
  and installing dependencies are the parts that may need internet access.

For source-file formats, size limits, and extraction details, see
[`backend/LOCAL_SOURCES.md`](./backend/LOCAL_SOURCES.md).

## For contributors

### Frontend production build

```sh
cd frontend
npm ci
npm run build
```

### Backend tests

From the project folder:

```sh
./.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

### Frontend development server

In one Terminal window, start the FastAPI backend:

```sh
cd backend
../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

In a second Terminal window, start the frontend:

```sh
cd frontend
npm run dev
```

Open <http://127.0.0.1:5173/>. The development server forwards API requests to
the local backend. The production app is served at `/ui/`; API documentation
routes are disabled.

## Optional: remote demo

`start-public.command` is for invited remote demos, not normal offline use. It
adds password-protected access, but remote visitors' prompts, attachments, and
note queries will reach your Mac. Put a trusted HTTPS tunnel in front of
`127.0.0.1:8000`; **never expose port 8000 directly**. Stop the app and tunnel
when the demo ends.

## License

LearnSphere is available under the [MIT License](./LICENSE).
