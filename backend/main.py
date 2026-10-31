
import base64
import binascii
import hmac
import httpx
import io
import json
import logging
import os
import re
import secrets
import time
import zipfile
from fastapi import FastAPI, HTTPException, Request, Response
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from gemma import (
    ask_gemma,
    grade_exam_responses,
    generate_exam_questions,
    generate_flashcards,
    generate_study_roadmap,
    get_ollama_status,
    verify_exam_questions,
)
from retrieval import (
    MAX_BINARY_BASE64_CHARS,
    MAX_BINARY_DOCUMENT_BYTES,
    MAX_SOURCE_FILES,
    MAX_TEXT_SOURCE_BYTES,
    SOURCE_DIR,
    clear_source_text_cache,
    find_relevant_document,
    find_relevant_sources,
)

app = FastAPI(
    title="LearnSphere",
    description="Offline AI Education Assistant",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

ACCESS_PASSWORD = os.environ.get("LearnSphere_ACCESS_PASSWORD", "")
if ACCESS_PASSWORD and not 12 <= len(ACCESS_PASSWORD) <= 256:
    raise RuntimeError("LearnSphere_ACCESS_PASSWORD must be between 12 and 256 characters")

SESSION_COOKIE_NAME = "learnsphere_session"
SESSION_MAX_AGE = 12 * 60 * 60
COOKIE_SECURE = os.environ.get("LearnSphere_COOKIE_SECURE", "true").strip().lower() not in {"0", "false", "no"}
sessions: dict[str, float] = {}
login_failures: dict[str, tuple[float, int]] = {}
logger = logging.getLogger(__name__)


def session_is_valid(request: Request) -> bool:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    expires_at = sessions.get(token or "", 0)
    if expires_at <= time.monotonic():
        sessions.pop(token or "", None)
        return False
    return True


def same_origin_request(request: Request) -> bool:
    origin = request.headers.get("origin", "")
    host = request.headers.get("host", "").lower()
    if not origin or not host:
        return False
    try:
        return urlsplit(origin).netloc.lower() == host
    except ValueError:
        return False


@app.middleware("http")
async def require_access_session(request: Request, call_next):
    if not ACCESS_PASSWORD:
        return await call_next(request)

    path = request.url.path
    if path in {"/auth/status", "/auth/login", "/auth/logout"} or path == "/ui" or path.startswith("/ui/"):
        return await call_next(request)

    if not session_is_valid(request):
        return Response(
            content='{"detail":"Sign in to use LearnSphere"}',
            status_code=401,
            media_type="application/json",
        )
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and not same_origin_request(request):
        return Response(
            content='{"detail":"This request must come from the LearnSphere page"}',
            status_code=403,
            media_type="application/json",
        )
    return await call_next(request)

app.mount(
    "/ui",
    StaticFiles(directory=Path(__file__).resolve().parent.parent / "frontend" / "dist", html=True),
    name="ui",
)

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    image: str | None = Field(default=None, max_length=7000000)

class SourceUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=180)
    content: str | None = Field(default=None, min_length=1, max_length=MAX_TEXT_SOURCE_BYTES)
    content_base64: str | None = Field(default=None, max_length=MAX_BINARY_BASE64_CHARS)

    @field_validator("filename")
    @classmethod
    def validate_source_filename(cls, value: str) -> str:
        value = value.strip()
        if not value or value.startswith(".") or "/" in value or "\\" in value or value in {".", ".."}:
            raise ValueError("Use a plain filename without folder paths")
        if Path(value).suffix.lower() not in {".md", ".txt", ".rtf", ".pdf", ".docx"}:
            raise ValueError("Only Markdown, text, RTF, PDF, and Word notes are supported")
        return value

    @field_validator("content")
    @classmethod
    def validate_source_content(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("The study note is empty")
        return value

    @model_validator(mode="after")
    def validate_upload_format(self):
        is_binary_document = Path(self.filename).suffix.lower() in {".pdf", ".docx"}
        if is_binary_document and (self.content is not None or not self.content_base64):
            raise ValueError("PDF and Word notes must be provided as base64 data")
        if not is_binary_document and (self.content_base64 is not None or self.content is None):
            raise ValueError("Text notes must be provided as UTF-8 text")
        return self


class ExamRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=80)
    topic: str = Field(min_length=2, max_length=160)
    class_level: Literal[
        "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"
    ] = "Class 8"
    language: Literal["English", "Hindi", "Hinglish"] = "English"
    question_count: int = Field(default=5, ge=3, le=10)

    @field_validator("subject", "topic")
    @classmethod
    def fields_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Subject and topic cannot be blank")
        return value


class ExamQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    question_type: Literal["multiple_choice", "fill_blank", "reflective"]
    difficulty: Literal["easy", "medium", "hard"]
    options: list[str] = Field(default_factory=list, max_length=4)
    correct_index: int | None = Field(default=None, ge=0, le=3)
    accepted_answers: list[str] = Field(default_factory=list, max_length=10)
    expected_answer: str = Field(min_length=1, max_length=1200)
    max_marks: int = Field(ge=1, le=5)
    grading_criteria: str = Field(max_length=800)
    explanation: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_question_format(self):
        if self.question_type == "multiple_choice":
            normalized = [option.strip() for option in self.options]
            if (
                len(normalized) != 4
                or any(not option for option in normalized)
                or len({option.casefold() for option in normalized}) != 4
                or self.correct_index is None
                or self.max_marks != 1
                or self.expected_answer.strip().casefold()
                != normalized[self.correct_index].casefold()
            ):
                raise ValueError("Multiple-choice questions must have four distinct options and one matching answer")
            self.options = normalized
            self.accepted_answers = []
        elif self.question_type == "fill_blank":
            accepted = [answer.strip() for answer in self.accepted_answers]
            if (
                self.options
                or self.correct_index is not None
                or not accepted
                or any(not answer for answer in accepted)
                or self.max_marks != 1
                or self.expected_answer.strip().casefold()
                not in {answer.casefold() for answer in accepted}
            ):
                raise ValueError("Fill-in-the-blank questions need accepted answers and no options")
            self.accepted_answers = accepted
        elif (
            self.options
            or self.correct_index is not None
            or self.accepted_answers
            or not self.grading_criteria.strip()
            or not 2 <= self.max_marks <= 5
        ):
            raise ValueError("Reflective questions need grading criteria and 2 to 5 marks")
        return self


class ExamResponse(BaseModel):
    question_id: int = Field(ge=0, le=9)
    question: str = Field(min_length=1, max_length=1000)
    expected_answer: str = Field(min_length=1, max_length=1200)
    grading_criteria: str = Field(min_length=1, max_length=800)
    student_answer: str = Field(min_length=1, max_length=1600)
    max_marks: int = Field(ge=2, le=5)

    @field_validator("question", "expected_answer", "grading_criteria", "student_answer")
    @classmethod
    def response_fields_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Exam responses cannot be blank")
        return value


class ExamGradeRequest(BaseModel):
    responses: list[ExamResponse] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def response_ids_must_be_unique(self):
        ids = [response.question_id for response in self.responses]
        if len(ids) != len(set(ids)):
            raise ValueError("Exam response question IDs must be unique")
        return self


class ExamGrade(BaseModel):
    question_id: int = Field(ge=0, le=9)
    marks_awarded: int = Field(ge=0, le=5)
    feedback: str = Field(min_length=1, max_length=800)
    correction: str = Field(min_length=1, max_length=1200)


class FlashcardRequest(BaseModel):
    subject: Literal["Maths", "English", "Science"]
    topic: str = Field(min_length=2, max_length=160)
    class_level: Literal[
        "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"
    ] = "Class 8"
    language: Literal["English", "Hindi", "Hinglish"] = "English"
    card_count: int = Field(default=10, ge=3, le=20)

    @field_validator("topic")
    @classmethod
    def topic_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Topic cannot be blank")
        return value


class Flashcard(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    answer: str = Field(min_length=2, max_length=1200)


class FlashcardDeck(BaseModel):
    cards: list[Flashcard] = Field(min_length=3, max_length=20)

    @field_validator("cards")
    @classmethod
    def questions_must_be_unique(cls, values: list[Flashcard]) -> list[Flashcard]:
        questions = [card.question.strip().casefold() for card in values]
        if len(set(questions)) != len(questions):
            raise ValueError("Flashcard questions must be unique")
        return values


class RoadmapRequest(BaseModel):
    class_level: Literal[
        "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"
    ]
    subject: Literal["Maths", "English", "Science"]
    language: Literal["English", "Hindi", "Hinglish"] = "English"


class RoadmapUnit(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    lessons: list[str] = Field(min_length=3, max_length=5)
    estimated_days: int = Field(ge=2, le=30)
    checkpoint: str = Field(min_length=2, max_length=400)

    @field_validator("lessons")
    @classmethod
    def lessons_must_be_nonblank(cls, values: list[str]) -> list[str]:
        normalized = [lesson.strip() for lesson in values]
        if any(not lesson for lesson in normalized):
            raise ValueError("Every roadmap lesson must have a title")
        if len({lesson.casefold() for lesson in normalized}) != len(normalized):
            raise ValueError("Roadmap lesson titles must be unique within a chapter")
        return normalized


class Roadmap(BaseModel):
    overview: str = Field(min_length=10, max_length=1000)
    units: list[RoadmapUnit] = Field(min_length=8, max_length=14)

    @field_validator("units")
    @classmethod
    def chapter_titles_must_be_unique(cls, values: list[RoadmapUnit]) -> list[RoadmapUnit]:
        titles = [unit.title.strip().casefold() for unit in values]
        if len(set(titles)) != len(titles):
            raise ValueError("Roadmap chapter titles must be unique")
        return values


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@app.get("/auth/status")
def auth_status(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {
        "required": bool(ACCESS_PASSWORD),
        "authenticated": not ACCESS_PASSWORD or session_is_valid(request),
    }


@app.post("/auth/login")
def auth_login(request: Request, credentials: LoginRequest, response: Response):
    if not ACCESS_PASSWORD:
        raise HTTPException(status_code=409, detail="Public access is not enabled")
    if not same_origin_request(request):
        raise HTTPException(status_code=403, detail="Sign in from the LearnSphere page")

    client_key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window_started, failures = login_failures.get(client_key, (now, 0))
    for old_client, (started, _) in list(login_failures.items()):
        if now - started >= 15 * 60:
            login_failures.pop(old_client, None)
    if now - window_started >= 15 * 60:
        window_started, failures = now, 0
    if failures >= 8:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Wait 15 minutes and try again.")

    if not hmac.compare_digest(credentials.password.encode("utf-8"), ACCESS_PASSWORD.encode("utf-8")):
        login_failures[client_key] = (window_started, failures + 1)
        raise HTTPException(status_code=401, detail="That password did not match")

    login_failures.pop(client_key, None)
    for old_token, expires_at in list(sessions.items()):
        if expires_at <= now:
            sessions.pop(old_token, None)
    token = secrets.token_urlsafe(32)
    sessions[token] = now + SESSION_MAX_AGE
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True}


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response):
    if ACCESS_PASSWORD and not same_origin_request(request):
        raise HTTPException(status_code=403, detail="This request must come from the LearnSphere page")
    token = request.cookies.get(SESSION_COOKIE_NAME)
    sessions.pop(token or "", None)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", secure=COOKIE_SECURE, httponly=True, samesite="strict")
    return {"authenticated": False}


_FOLLOW_UP_REFERENCE = re.compile(
    r"\b(?:it|this|that|these|those|them|above|more|simpler|simple|example|quiz|again|elaborate|mean|इसे|इसको|इसका|इसकी|इस|उसे|उसको|उसका|उसकी|वह|वो|यह|ऐसा|ऐसी|सरल|आसान|उदाहरण|फिर|दोबारा|समझाओ|isko|isey|isse|usko|uska|uski|aisa|aisi|aasan|udaharan|dobara|samjhao|phir|aur)\b",
    re.IGNORECASE,
)


def source_lookup_query(question: str, history: list[ChatTurn]) -> str:
    if not _FOLLOW_UP_REFERENCE.search(question):
        return question
    recent_questions = [turn.content for turn in history if turn.role == "user"][-2:]
    return "\n".join([*recent_questions, question]) if recent_questions else question


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    class_level: str = "Class 10"
    subject: str = "General"
    language: Literal["English", "Hindi", "Hinglish"] = "English"
    source_only: bool = False
    image: str | None = Field(default=None, max_length=7000000)
    document_filename: str | None = Field(default=None, max_length=180)
    document_base64: str | None = Field(default=None, max_length=MAX_BINARY_BASE64_CHARS)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)

    @field_validator("document_filename")
    @classmethod
    def validate_document_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if (
            not value
            or value.startswith(".")
            or "/" in value
            or "\\" in value
            or Path(value).suffix.lower() not in {".pdf", ".docx"}
        ):
            raise ValueError("Attach a PDF or Word (.docx) document")
        return value

    @model_validator(mode="after")
    def validate_document_attachment(self):
        if bool(self.document_filename) != bool(self.document_base64):
            raise ValueError("A document filename and its base64 data must be provided together")
        return self

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question cannot be blank")
        return value

@app.get("/")
def home():
    return {
        "app": "LearnSphere",
        "status": "running"
    }

@app.get("/health")
async def health():
    status = await get_ollama_status()
    if status["status"] != "ready":
        raise HTTPException(status_code=503, detail=status)
    return {"status": "healthy", "model": status["model"]}

def list_local_sources() -> list[str]:
    try:
        return sorted(
            path.relative_to(SOURCE_DIR).as_posix()
            for path in SOURCE_DIR.rglob("*")
            if path.is_file()
            and not path.name.startswith(".")
            and path.suffix.lower() in {".md", ".txt", ".rtf", ".pdf", ".docx"}
        )
    except OSError:
        return []


@app.get("/sources")
def get_sources():
    return {"sources": list_local_sources()}


@app.post("/exam")
async def create_exam(request: ExamRequest):
    source_query = f"{request.subject} {request.topic}"
    sources = await run_in_threadpool(find_relevant_sources, source_query, 5)
    questions = None
    validation_feedback = ""
    for attempt in range(2):
        try:
            generation_args = (
                request.subject,
                request.topic,
                request.class_level,
                request.language,
                request.question_count,
                sources,
            )
            if validation_feedback:
                generated = await generate_exam_questions(
                    *generation_args,
                    validation_feedback=validation_feedback,
                )
            else:
                generated = await generate_exam_questions(*generation_args)
        except httpx.HTTPError as error:
            response_status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
            logger.warning(
                "Local exam generation attempt %s failed: %s (status %s)",
                attempt + 1,
                type(error).__name__,
                response_status,
            )
            raise HTTPException(
                status_code=502,
                detail="Could not generate an exam with the local model. Check Ollama and try again.",
            ) from error
        except (ValueError, TypeError) as error:
            logger.warning(
                "Local exam generation attempt %s returned invalid JSON structure: %s",
                attempt + 1,
                type(error).__name__,
            )
            validation_feedback = "The previous response was not a valid exam JSON object. Return only the exact requested JSON structure with exactly the requested number of questions."
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma returned an invalid exam. Please try generating it again.",
                ) from error
            continue
        try:
            candidate = [
                ExamQuestion.model_validate(question).model_dump()
                for question in generated["questions"]
            ]
        except (KeyError, TypeError, ValidationError) as error:
            details = (
                error.errors(include_input=False)
                if isinstance(error, ValidationError)
                else type(error).__name__
            )
            logger.warning(
                "Local exam generation attempt %s failed schema validation: %s",
                attempt + 1,
                details,
            )
            validation_feedback = (
                "The previous draft failed question schema validation. Fix all reported errors, obey the field limits, and return a complete valid exam. "
                + (json.dumps(details, ensure_ascii=False, default=str)[:800] if isinstance(details, list) else str(details))
            )
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma returned an invalid exam. Please try generating it again.",
                ) from error
            continue
        if len(candidate) != request.question_count:
            validation_feedback = f"The previous draft contained {len(candidate)} questions. Return exactly {request.question_count}."
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma did not create the requested number of questions. Please try again.",
                )
            continue
        if (
            {question["question_type"] for question in candidate}
            != {"multiple_choice", "fill_blank", "reflective"}
            or {question["difficulty"] for question in candidate}
            != {"easy", "medium", "hard"}
        ):
            validation_feedback = "The previous draft must include all three question types and all three difficulty levels: easy, medium, and hard."
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma did not include every question type and difficulty. Please try again.",
                )
            continue

        objective_questions = [
            {"question_id": index, **question}
            for index, question in enumerate(candidate)
            if question["question_type"] != "reflective"
        ]
        try:
            verification = await verify_exam_questions(
                request.subject,
                request.topic,
                request.class_level,
                objective_questions,
            )
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502,
                detail="Could not verify exam answers with the local model. Check Ollama and try again.",
            ) from error
        except (ValueError, TypeError, KeyError) as error:
            logger.warning(
                "Local exam verification attempt %s returned an invalid response: %s",
                attempt + 1,
                type(error).__name__,
            )
            validation_feedback = "The independent answer check returned an invalid response. Recreate and carefully verify every objective answer."
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma could not verify the exam answers. Please try again.",
                ) from error
            continue

        checks = verification.get("checks") if isinstance(verification, dict) else None
        expected_ids = {question["question_id"] for question in objective_questions}
        valid_checks = (
            isinstance(checks, list)
            and len(checks) == len(expected_ids)
            and all(
                isinstance(check, dict)
                and type(check.get("question_id")) is int
                and check.get("question_id") in expected_ids
                and type(check.get("valid")) is bool
                and isinstance(check.get("reasoning"), str)
                and isinstance(check.get("computed_answer"), str)
                and isinstance(check.get("issue"), str)
                for check in checks
            )
            and {check["question_id"] for check in checks} == expected_ids
        )
        if not valid_checks or any(not check["valid"] for check in checks):
            issues = (
                [
                    f"Question {check['question_id'] + 1}: "
                    f"{check['issue'] or check['reasoning']} "
                    f"Independently computed answer: {check['computed_answer']}"
                    for check in checks
                    if not check["valid"]
                ]
                if valid_checks
                else ["The independent answer check was incomplete or malformed."]
            )
            validation_feedback = " ".join(issues)[:1200]
            logger.warning(
                "Local exam verification attempt %s rejected objective answers: %s",
                attempt + 1,
                validation_feedback,
            )
            if attempt == 1:
                raise HTTPException(
                    status_code=502,
                    detail="Gemma could not produce objective answers that passed independent verification. Please try again.",
                )
            continue

        questions = candidate
        break

    if questions is None:
        raise HTTPException(
            status_code=502,
            detail="Gemma returned an invalid exam. Please try generating it again.",
        )
    return {
        "subject": request.subject,
        "topic": request.topic,
        "class_level": request.class_level,
        "questions": questions,
        "sources": sources,
    }


@app.post("/exam/grade")
async def grade_exam(request: ExamGradeRequest):
    responses = [response.model_dump() for response in request.responses]
    try:
        generated = await grade_exam_responses(responses)
        grades = [
            ExamGrade.model_validate(grade).model_dump()
            for grade in generated["grades"]
        ]
    except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Could not grade reflective answers with the local model. Check Ollama and try again.",
        ) from error

    max_marks_by_id = {response.question_id: response.max_marks for response in request.responses}
    grade_ids = [grade["question_id"] for grade in grades]
    expected_ids = set(max_marks_by_id)
    if (
        len(grades) != len(request.responses)
        or set(grade_ids) != expected_ids
        or len(grade_ids) != len(set(grade_ids))
        or any(grade["marks_awarded"] > max_marks_by_id[grade["question_id"]] for grade in grades)
    ):
        raise HTTPException(
            status_code=502,
            detail="Gemma returned invalid reflective marks. Please try grading again.",
        )
    return {"grades": grades}


@app.post("/flashcards")
async def create_flashcards(request: FlashcardRequest):
    sources = await run_in_threadpool(
        find_relevant_sources,
        f"{request.subject} {request.topic}",
        5,
    )
    try:
        generated = await generate_flashcards(
            request.subject,
            request.topic,
            request.class_level,
            request.language,
            request.card_count,
            sources,
        )
        deck = FlashcardDeck.model_validate(generated)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Could not create a valid flashcard deck with the local model. Check Ollama and try again.",
        ) from error
    if len(deck.cards) != request.card_count:
        raise HTTPException(
            status_code=502,
            detail="Gemma did not create the requested number of flashcards. Please try again.",
        )
    return {
        "subject": request.subject,
        "topic": request.topic,
        "class_level": request.class_level,
        "cards": [card.model_dump() for card in deck.cards],
        "sources": [source["citation"] for source in sources],
        "source_based": bool(sources),
    }


@app.post("/roadmap")
async def create_roadmap(request: RoadmapRequest):
    try:
        generated = await generate_study_roadmap(
            request.subject,
            request.class_level,
            request.language,
        )
        roadmap = Roadmap.model_validate(generated)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Could not create a valid study roadmap with the local model. Check Ollama and try again.",
        ) from error
    return {
        "subject": request.subject,
        "class_level": request.class_level,
        "language": request.language,
        "curriculum": "NCERT / CBSE-aligned draft",
        **roadmap.model_dump(),
    }


def decode_binary_document(filename: str, encoded: str | None) -> bytes:
    try:
        content = base64.b64decode(encoded or "", validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="This document upload is not valid base64 data")
    if len(content) > MAX_BINARY_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="PDF and Word documents must be 10 MB or smaller")

    extension = Path(filename).suffix.lower()
    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="This file does not look like a PDF")
    if extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                names = set(archive.namelist())
                expanded_size = sum(info.file_size for info in archive.infolist())
                document_info = archive.getinfo("word/document.xml")
                valid_docx = (
                    "[Content_Types].xml" in names
                    and expanded_size <= 50_000_000
                    and document_info.file_size <= 10_000_000
                )
        except (OSError, ValueError, zipfile.BadZipFile, KeyError):
            valid_docx = False
        if not valid_docx:
            raise HTTPException(status_code=422, detail="This file is not a supported Word document")
    return content


@app.post("/sources", status_code=201)
def add_source(request: SourceUploadRequest):
    extension = Path(request.filename).suffix.lower()
    if extension in {".pdf", ".docx"}:
        content = decode_binary_document(request.filename, request.content_base64)
    else:
        content = (request.content or "").encode("utf-8")
        if len(content) > MAX_TEXT_SOURCE_BYTES:
            raise HTTPException(status_code=413, detail="Text notes must be 1 MB or smaller")
    if len(list_local_sources()) >= MAX_SOURCE_FILES:
        raise HTTPException(status_code=413, detail="The local source library is full")

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    destination = SOURCE_DIR / request.filename
    try:
        with destination.open("xb") as source_file:
            source_file.write(content)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A note with this filename already exists")
    except OSError as error:
        raise HTTPException(status_code=500, detail="Could not save this local note") from error

    clear_source_text_cache()
    return {"added": request.filename, "sources": list_local_sources()}


@app.delete("/sources/{filename}")
def delete_source(filename: str):
    if not filename or "/" in filename or "\\" in filename or Path(filename).suffix.lower() not in {".md", ".txt", ".rtf", ".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Choose a plain Markdown, text, RTF, PDF, or Word filename")

    source_path = SOURCE_DIR / filename
    if source_path.is_symlink():
        raise HTTPException(status_code=400, detail="Linked files cannot be removed from the source library")
    if not source_path.is_file():
        raise HTTPException(status_code=404, detail="Local study note not found")
    try:
        source_path.unlink()
    except OSError as error:
        raise HTTPException(status_code=500, detail="Could not remove this local note") from error
    clear_source_text_cache()
    return {"removed": filename, "sources": list_local_sources()}


@app.post("/ask")
async def ask(request: AskRequest):
    try:
        source_query = source_lookup_query(request.question, request.history)
        sources = await run_in_threadpool(find_relevant_sources, source_query)
        if request.document_base64 and request.document_filename:
            document = decode_binary_document(request.document_filename, request.document_base64)
            try:
                document_sources = await run_in_threadpool(
                    find_relevant_document,
                    source_query,
                    request.document_filename,
                    document,
                )
            except (OSError, RuntimeError, ValueError) as error:
                raise HTTPException(status_code=422, detail=str(error)) from error
            sources = [*document_sources, *sources]
        if request.source_only and not sources:
            return {
                "assistant": "LearnSphere",
                "answer": "I couldn't find this topic in your local notes, so I didn't generate a general answer. Add a note or ask about a topic it covers.",
                "sources": [],
                "source_excerpts": [],
                "source_based": False,
                "answer_mode": "no_source",
            }
        answer = await ask_gemma(
            request.question,
            request.class_level,
            request.subject,
            request.language,
            [
                {
                    "role": turn.role,
                    "content": turn.content,
                    **({"images": [turn.image]} if turn.image else {})
                }
                for turn in request.history[-8:]
            ],
            request.image,
            sources
        )

        return {
            "assistant": "LearnSphere",
            "answer": answer,
            "sources": [source["citation"] for source in sources],
            "source_excerpts": sources,
            "source_based": bool(sources),
            "answer_mode": "sourced" if sources else "general",
        }

    except HTTPException:
        raise
    except httpx.HTTPError as error:
        logger.warning("Local Ollama request failed while answering a question: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Could not get an answer from local Ollama. Check that Ollama and Gemma are running, then try again.",
        ) from error
    except (ValueError, TypeError, KeyError) as error:
        logger.warning("Local Ollama returned an invalid answer response: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Gemma returned an invalid answer. Please try again.",
        ) from error
