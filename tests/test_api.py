import base64
import html
import json
import shutil
import sys
import unittest
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from unittest.mock import AsyncMock, patch

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
import gemma
import main
import retrieval




def make_docx(text):
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body><w:p><w:r><w:t>' + html.escape(text) + '</w:t></w:r></w:p></w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


def make_single_page_pdf(text):
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode())
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    return bytes(pdf)


def make_exam_verification(questions, invalid_question_id=None):
    return {
        "checks": [
            {
                "question_id": question["question_id"],
                "reasoning": "Solved independently from the question.",
                "computed_answer": question["expected_answer"],
                "valid": question["question_id"] != invalid_question_id,
                "issue": "The computed result does not match the answer." if question["question_id"] == invalid_question_id else "",
            }
            for question in questions
        ]
    }


class LearnSphereApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        transport = httpx.ASGITransport(app=main.app)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_home_endpoint(self):
        response = await self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"app": "LearnSphere", "status": "running"})

    async def test_health_reports_local_model(self):
        status = {"status": "ready", "model": "gemma4:e4b"}
        with patch.object(main, "get_ollama_status", new=AsyncMock(return_value=status)):
            response = await self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "healthy", "model": "gemma4:e4b"})

    async def test_health_returns_unavailable_when_model_is_offline(self):
        status = {"status": "offline", "model": "gemma4:e4b"}
        with patch.object(main, "get_ollama_status", new=AsyncMock(return_value=status)):
            response = await self.client.get("/health")
        self.assertEqual(response.status_code, 503)

    async def test_exam_generates_questions_with_local_recommendations(self):
        questions = [
            {
                "question": "Which gas do plants absorb during photosynthesis?",
                "question_type": "multiple_choice",
                "difficulty": "easy",
                "options": ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
                "correct_index": 1,
                "accepted_answers": ["Carbon dioxide"],
                "expected_answer": "Carbon dioxide",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "Plants use carbon dioxide to make glucose.",
            },
            {
                "question": "The green pigment in leaves is ____.",
                "question_type": "fill_blank",
                "difficulty": "medium",
                "options": [],
                "correct_index": None,
                "accepted_answers": ["chlorophyll"],
                "expected_answer": "chlorophyll",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "Chlorophyll absorbs light energy.",
            },
            {
                "question": "Explain how light supports photosynthesis.",
                "question_type": "reflective",
                "difficulty": "hard",
                "options": [],
                "correct_index": None,
                "accepted_answers": [],
                "expected_answer": "Light provides energy for plants to make glucose.",
                "max_marks": 3,
                "grading_criteria": "Award marks for energy, glucose production, and a clear link.",
                "explanation": "Light energy drives the reactions that produce glucose.",
            },
        ]
        sources = [{"citation": "biology.md — Photosynthesis", "text": "Plants use carbon dioxide."}]
        mock_generate = AsyncMock(return_value={"questions": questions})
        mock_verify = AsyncMock(side_effect=lambda _, __, ___, objective: make_exam_verification(objective))
        with patch.object(main, "find_relevant_sources", return_value=sources), patch.object(
            main, "generate_exam_questions", new=mock_generate
        ), patch.object(main, "verify_exam_questions", new=mock_verify):
            response = await self.client.post(
                "/exam",
                json={
                    "subject": "Science",
                    "topic": "Photosynthesis",
                    "class_level": "Class 8",
                    "language": "English",
                    "question_count": 3,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["questions"]), 3)
        self.assertEqual(response.json()["questions"][0]["accepted_answers"], [])
        self.assertEqual(
            [question["difficulty"] for question in response.json()["questions"]],
            ["easy", "medium", "hard"],
        )
        self.assertEqual(
            [question["question_type"] for question in response.json()["questions"]],
            ["multiple_choice", "fill_blank", "reflective"],
        )
        self.assertEqual(response.json()["sources"], sources)
        mock_generate.assert_awaited_once_with(
            "Science", "Photosynthesis", "Class 8", "English", 3, sources
        )
        mock_verify.assert_awaited_once()

    async def test_exam_rejects_invalid_request_and_model_output(self):
        invalid_request = await self.client.post(
            "/exam", json={"subject": "Science", "topic": "x", "question_count": 2}
        )
        self.assertEqual(invalid_request.status_code, 422)

        bad_question = {
            "question": "Pick an answer",
            "question_type": "multiple_choice",
            "difficulty": "easy",
            "options": ["Only one option"],
            "correct_index": 0,
            "accepted_answers": [],
            "expected_answer": "Only one option",
            "max_marks": 1,
            "grading_criteria": "",
            "explanation": "Invalid choices.",
        }
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "generate_exam_questions", new=AsyncMock(return_value={"questions": [bad_question] * 3})
        ):
            invalid_output = await self.client.post(
                "/exam",
                json={"subject": "Science", "topic": "Photosynthesis", "question_count": 3},
            )
        self.assertEqual(invalid_output.status_code, 502)

    async def test_exam_retries_invalid_local_model_output(self):
        questions = [
            {
                "question": "Which rule differentiates x squared?",
                "question_type": "multiple_choice",
                "difficulty": "easy",
                "options": ["2x", "x", "x squared", "1"],
                "correct_index": 0,
                "accepted_answers": [],
                "expected_answer": "2x",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "The power rule gives the derivative 2x.",
            },
            {
                "question": "The derivative of x is ____.",
                "question_type": "fill_blank",
                "difficulty": "medium",
                "options": [],
                "correct_index": None,
                "accepted_answers": ["1"],
                "expected_answer": "1",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "The derivative of x is 1.",
            },
            {
                "question": "Explain why the derivative of a constant is zero.",
                "question_type": "reflective",
                "difficulty": "hard",
                "options": [],
                "correct_index": None,
                "accepted_answers": [],
                "expected_answer": "A constant does not change as x changes.",
                "max_marks": 2,
                "grading_criteria": "Explain that the constant is unchanged and so its rate of change is zero.",
                "explanation": "A constant has no rate of change.",
            },
        ]
        malformed = {"questions": [{"question": "Incomplete"}] * 3}
        mock_generate = AsyncMock(side_effect=[malformed, {"questions": questions}])
        mock_verify = AsyncMock(side_effect=lambda _, __, ___, objective: make_exam_verification(objective))
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "generate_exam_questions", new=mock_generate
        ), patch.object(main, "verify_exam_questions", new=mock_verify):
            response = await self.client.post(
                "/exam",
                json={"subject": "Maths", "topic": "Differentiation", "question_count": 3},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_generate.await_count, 2)
        self.assertEqual(mock_verify.await_count, 1)

    async def test_exam_regenerates_answers_rejected_by_independent_verification(self):
        questions = [
            {
                "question": "Which rule differentiates x squared?",
                "question_type": "multiple_choice",
                "difficulty": "easy",
                "options": ["2x", "x", "x squared", "1"],
                "correct_index": 0,
                "accepted_answers": [],
                "expected_answer": "2x",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "The power rule gives the derivative 2x.",
            },
            {
                "question": "The derivative of x is ____.",
                "question_type": "fill_blank",
                "difficulty": "medium",
                "options": [],
                "correct_index": None,
                "accepted_answers": ["1"],
                "expected_answer": "1",
                "max_marks": 1,
                "grading_criteria": "",
                "explanation": "The derivative of x is 1.",
            },
            {
                "question": "Explain why the derivative of a constant is zero.",
                "question_type": "reflective",
                "difficulty": "hard",
                "options": [],
                "correct_index": None,
                "accepted_answers": [],
                "expected_answer": "A constant does not change as x changes.",
                "max_marks": 2,
                "grading_criteria": "Explain that the constant is unchanged and so its rate of change is zero.",
                "explanation": "A constant has no rate of change.",
            },
        ]
        mock_generate = AsyncMock(side_effect=[
            {"questions": questions},
            {"questions": questions},
        ])
        mock_verify = AsyncMock(side_effect=[
            make_exam_verification(
                [
                    {"question_id": 0, "expected_answer": "2x"},
                    {"question_id": 1, "expected_answer": "1"},
                ],
                invalid_question_id=0,
            ),
            make_exam_verification(
                [
                    {"question_id": 0, "expected_answer": "2x"},
                    {"question_id": 1, "expected_answer": "1"},
                ]
            ),
        ])
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "generate_exam_questions", new=mock_generate
        ), patch.object(main, "verify_exam_questions", new=mock_verify):
            response = await self.client.post(
                "/exam",
                json={"subject": "Maths", "topic": "Differentiation", "question_count": 3},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_generate.await_count, 2)
        self.assertIn("Question 1", mock_generate.await_args_list[1].kwargs["validation_feedback"])

    async def test_exam_verifier_uses_local_ollama_and_requires_calculation_checks(self):
        verification = {
            "checks": [
                {
                    "question_id": 0,
                    "reasoning": "Differentiate v(t) to get 6t, then substitute t=2.",
                    "computed_answer": "12",
                    "valid": False,
                    "issue": "12 is not among the options.",
                }
            ]
        }

        class MockResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"message": {"content": json.dumps(verification)}}

        class MockOllamaClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, json):
                self.url = url
                self.payload = json
                return MockResponse()

        client = MockOllamaClient()
        objective = [{
            "question_id": 0,
            "question_type": "multiple_choice",
            "question": "Find the acceleration when v(t)=3t^2-2 at t=2.",
            "options": ["4", "6", "8", "10"],
            "correct_index": 1,
            "expected_answer": "6",
        }]
        with patch.object(gemma.httpx, "AsyncClient", return_value=client):
            result = await gemma.verify_exam_questions(
                "Maths", "Differentiation", "Class 12", objective
            )

        self.assertEqual(result, verification)
        self.assertEqual(client.url, gemma.OLLAMA_URL)
        self.assertEqual(client.payload["model"], gemma.MODEL_NAME)
        self.assertIn("substitute every given value", client.payload["messages"][1]["content"])
        self.assertEqual(client.payload["format"]["properties"]["checks"]["minItems"], 1)

    async def test_exam_generation_builds_one_constrained_question_per_local_request(self):
        class MockResponse:
            def __init__(self, content):
                self.content = content

            def raise_for_status(self):
                pass

            def json(self):
                return {"message": {"content": json.dumps(self.content)}}

        class MockOllamaClient:
            def __init__(self):
                self.calls = []

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, json):
                self.calls.append((url, json))
                question_type = json["format"]["properties"]["question_type"]["enum"][0]
                difficulty = json["format"]["properties"]["difficulty"]["enum"][0]
                content = {
                    "question": "Which rule differentiates x squared?",
                    "question_type": question_type,
                    "difficulty": difficulty,
                    "options": ["2x", "x", "x squared", "1"] if question_type == "multiple_choice" else [],
                    "correct_index": 0 if question_type == "multiple_choice" else None,
                    "accepted_answers": ["1"] if question_type == "fill_blank" else [],
                    "expected_answer": "2x" if question_type == "multiple_choice" else "1",
                    "max_marks": 3 if question_type == "reflective" else 1,
                    "grading_criteria": "Award marks for the key ideas." if question_type == "reflective" else "",
                    "explanation": "The power rule gives the derivative 2x.",
                }
                return MockResponse(content)

        client = MockOllamaClient()
        with patch.object(gemma.httpx, "AsyncClient", return_value=client):
            result = await gemma.generate_exam_questions(
                "Maths", "Differentiation", "Class 12", "English", 5, []
            )

        questions = result["questions"]
        self.assertEqual(len(questions), 5)
        self.assertEqual(len(client.calls), 5)
        self.assertEqual(
            [(question["question_type"], question["difficulty"]) for question in questions],
            [
                ("multiple_choice", "easy"),
                ("fill_blank", "easy"),
                ("reflective", "medium"),
                ("multiple_choice", "medium"),
                ("fill_blank", "hard"),
            ],
        )
        self.assertTrue(all(url == gemma.OLLAMA_URL for url, _ in client.calls))
        self.assertTrue(all(payload["model"] == gemma.MODEL_NAME for _, payload in client.calls))

    async def test_exam_grades_reflective_answers_with_local_model(self):
        response_data = {
            "question_id": 2,
            "question": "Explain how light supports photosynthesis.",
            "expected_answer": "Light provides energy for plants to make glucose.",
            "grading_criteria": "Award marks for energy and glucose production.",
            "student_answer": "Light gives plants energy to make glucose.",
            "max_marks": 3,
        }
        grades = {
            "grades": [
                {
                    "question_id": 2,
                    "marks_awarded": 3,
                    "feedback": "You identified both the energy source and product.",
                    "correction": "Light energy enables plants to make glucose.",
                }
            ]
        }
        mock_grade = AsyncMock(return_value=grades)
        with patch.object(main, "grade_exam_responses", new=mock_grade):
            response = await self.client.post("/exam/grade", json={"responses": [response_data]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["grades"], grades["grades"])
        mock_grade.assert_awaited_once_with([response_data])

    async def test_exam_rejects_out_of_range_gemmas_reflective_marks(self):
        response_data = {
            "question_id": 1,
            "question": "Explain the process.",
            "expected_answer": "A correct answer.",
            "grading_criteria": "Award marks for two key ideas.",
            "student_answer": "A response.",
            "max_marks": 2,
        }
        grades = {
            "grades": [
                {
                    "question_id": 1,
                    "marks_awarded": 3,
                    "feedback": "Good.",
                    "correction": "Correct answer.",
                }
            ]
        }
        with patch.object(main, "grade_exam_responses", new=AsyncMock(return_value=grades)):
            response = await self.client.post("/exam/grade", json={"responses": [response_data]})
        self.assertEqual(response.status_code, 502)

    async def test_flashcards_generate_with_local_source_recommendations(self):
        source = {"citation": "science.md — Plants", "text": "Plants make glucose using light."}
        cards = [
            {"question": f"What is flashcard question {index}?", "answer": f"Answer {index}."}
            for index in range(5)
        ]
        mock_generate = AsyncMock(return_value={"cards": cards})
        with patch.object(main, "find_relevant_sources", return_value=[source]) as search, patch.object(
            main, "generate_flashcards", new=mock_generate
        ):
            response = await self.client.post(
                "/flashcards",
                json={
                    "subject": "Science",
                    "topic": "Photosynthesis",
                    "class_level": "Class 7",
                    "language": "English",
                    "card_count": 5,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["cards"]), 5)
        self.assertTrue(response.json()["source_based"])
        self.assertEqual(response.json()["sources"], [source["citation"]])
        search.assert_called_once_with("Science Photosynthesis", 5)
        mock_generate.assert_awaited_once_with(
            "Science", "Photosynthesis", "Class 7", "English", 5, [source]
        )

    async def test_flashcards_reject_invalid_request_duplicate_cards_and_wrong_count(self):
        unsupported_subject = await self.client.post(
            "/flashcards", json={"subject": "History", "topic": "Ancient India"}
        )
        self.assertEqual(unsupported_subject.status_code, 422)

        duplicate_cards = {"cards": [
            {"question": "What is a cell?", "answer": "The basic unit of life."},
            {"question": "What is a cell?", "answer": "A building block."},
            {"question": "What is a tissue?", "answer": "A group of cells."},
        ]}
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "generate_flashcards", new=AsyncMock(return_value=duplicate_cards)
        ):
            duplicate_response = await self.client.post(
                "/flashcards",
                json={"subject": "Science", "topic": "Cells", "card_count": 3},
            )
        self.assertEqual(duplicate_response.status_code, 502)

        too_few_cards = {"cards": [
            {"question": "What is a cell?", "answer": "The basic unit of life."}
        ]}
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "generate_flashcards", new=AsyncMock(return_value=too_few_cards)
        ):
            count_response = await self.client.post(
                "/flashcards",
                json={"subject": "Science", "topic": "Cells", "card_count": 5},
            )
        self.assertEqual(count_response.status_code, 502)

    async def test_roadmap_returns_valid_local_curriculum_draft(self):
        roadmap = {
            "overview": "Build algebra foundations, then solve equations and apply them to daily problems.",
            "units": [
                {
                    "title": f"Unit {index}",
                    "lessons": ["Understand the ideas", "Practise examples", "Review the topic"],
                    "estimated_days": 8,
                    "checkpoint": "Explain the key idea and solve a practice problem.",
                }
                for index in range(1, 9)
            ],
        }
        mock_generate = AsyncMock(return_value=roadmap)
        with patch.object(main, "generate_study_roadmap", new=mock_generate):
            response = await self.client.post(
                "/roadmap",
                json={"subject": "Maths", "class_level": "Class 8", "language": "English"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["curriculum"], "NCERT / CBSE-aligned draft")
        self.assertEqual(len(response.json()["units"]), 8)
        mock_generate.assert_awaited_once_with("Maths", "Class 8", "English")

    async def test_roadmap_rejects_unsupported_inputs_and_invalid_model_output(self):
        unsupported_subject = await self.client.post(
            "/roadmap", json={"subject": "History", "class_level": "Class 8"}
        )
        self.assertEqual(unsupported_subject.status_code, 422)

        with patch.object(
            main, "generate_study_roadmap", new=AsyncMock(return_value={"overview": "Too few chapters", "units": []})
        ):
            invalid_output = await self.client.post(
                "/roadmap", json={"subject": "English", "class_level": "Class 6"}
            )
        self.assertEqual(invalid_output.status_code, 502)

    async def test_roadmap_generation_uses_only_the_local_ollama_model(self):
        roadmap = {
            "overview": "Start with number foundations and progress toward algebra.",
            "units": [
                {
                    "title": f"Unit {index}",
                    "lessons": ["Learn the concept", "Work through examples", "Practise independently"],
                    "estimated_days": 7,
                    "checkpoint": "Solve a short set of practice problems.",
                }
                for index in range(1, 9)
            ],
        }

        class MockResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"message": {"content": json.dumps(roadmap)}}

        class MockOllamaClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, json):
                self.url = url
                self.payload = json
                return MockResponse()

        client = MockOllamaClient()
        with patch.object(gemma.httpx, "AsyncClient", return_value=client):
            result = await gemma.generate_study_roadmap("Science", "Class 7", "English")

        self.assertEqual(result, roadmap)
        self.assertEqual(client.url, gemma.OLLAMA_URL)
        self.assertEqual(client.payload["model"], gemma.MODEL_NAME)
        self.assertIn("NCERT/CBSE", client.payload["messages"][1]["content"])
        self.assertEqual(client.payload["format"]["properties"]["units"]["minItems"], 8)

    async def test_flashcard_generation_uses_only_the_local_ollama_model(self):
        cards = {
            "cards": [
                {"question": f"Question {index}?", "answer": f"Answer {index}."}
                for index in range(3)
            ]
        }

        class MockResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"message": {"content": json.dumps(cards)}}

        class MockOllamaClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, json):
                self.url = url
                self.payload = json
                return MockResponse()

        client = MockOllamaClient()
        local_sources = [{"citation": "maths.md — Fractions", "text": "A fraction represents part of a whole."}]
        with patch.object(gemma.httpx, "AsyncClient", return_value=client):
            result = await gemma.generate_flashcards(
                "Maths", "Fractions", "Class 6", "English", 3, local_sources
            )

        self.assertEqual(result, cards)
        self.assertEqual(client.url, gemma.OLLAMA_URL)
        self.assertEqual(client.payload["model"], gemma.MODEL_NAME)
        self.assertEqual(client.payload["format"]["properties"]["cards"]["minItems"], 3)
        self.assertIn("maths.md — Fractions", client.payload["messages"][1]["content"])
        prompt = client.payload["messages"][1]["content"]
        self.assertIn("Treat the specified class, subject, and topic as hard constraints", prompt)
        self.assertIn("photosynthesis facts in a Class 12 Maths deck", prompt)
        self.assertIn("every mathematical expression in valid LaTeX between $ delimiters", prompt)

    async def test_public_access_requires_password_and_protects_api_routes(self):
        from tempfile import TemporaryDirectory

        password = "demo-access-password-123"
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app),
            base_url="https://test",
        )
        with TemporaryDirectory() as directory, patch.object(main, "ACCESS_PASSWORD", password), patch.object(
            main, "SOURCE_DIR", Path(directory)
        ), patch.dict(main.sessions, {}, clear=True), patch.dict(main.login_failures, {}, clear=True):
            try:
                self.assertEqual((await client.get("/ui/")).status_code, 200)
                self.assertEqual((await client.get("/sources")).status_code, 401)
                self.assertEqual((await client.post("/ask", json={"question": "hello"})).status_code, 401)
                self.assertEqual((await client.get("/docs")).status_code, 401)
                self.assertEqual((await client.get("/openapi.json")).status_code, 401)

                wrong_password = await client.post(
                    "/auth/login",
                    json={"password": "not-the-password"},
                    headers={"Origin": "https://test"},
                )
                self.assertEqual(wrong_password.status_code, 401)

                login = await client.post(
                    "/auth/login",
                    json={"password": password},
                    headers={"Origin": "https://test"},
                )
                self.assertEqual(login.status_code, 200)
                cookie = login.headers["set-cookie"].lower()
                self.assertIn("httponly", cookie)
                self.assertIn("secure", cookie)
                self.assertIn("samesite=strict", cookie)
                self.assertEqual((await client.get("/sources")).status_code, 200)
                self.assertEqual((await client.get("/docs")).status_code, 404)
                self.assertEqual((await client.get("/openapi.json")).status_code, 404)

                cross_origin_upload = await client.post(
                    "/sources",
                    json={"filename": "notes.md", "content": "A private local note."},
                    headers={"Origin": "https://attacker.test"},
                )
                self.assertEqual(cross_origin_upload.status_code, 403)
                upload = await client.post(
                    "/sources",
                    json={"filename": "notes.md", "content": "A private local note."},
                    headers={"Origin": "https://test"},
                )
                self.assertEqual(upload.status_code, 201)

                logout = await client.post("/auth/logout", headers={"Origin": "https://test"})
                self.assertEqual(logout.status_code, 200)
                self.assertEqual((await client.get("/sources")).status_code, 401)
            finally:
                await client.aclose()

    @unittest.skipUnless(shutil.which("textutil"), "macOS textutil is required for RTF extraction")
    async def test_local_retrieval_extracts_rtf_notes_offline(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / "biology.rtf"
            source_file.write_text(
                r"{\rtf1\ansi Photosynthesis uses sunlight and chlorophyll.\par}",
                encoding="utf-8",
            )
            with patch.object(retrieval, "SOURCE_DIR", Path(directory)):
                matches = retrieval.find_relevant_sources("How does chlorophyll help photosynthesis?")

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "biology.rtf — biology")
        self.assertIn("sunlight", matches[0]["text"].lower())

    @unittest.skipUnless(shutil.which("swift") and sys.platform == "darwin", "macOS Swift, PDFKit, and Vision are required")
    async def test_local_retrieval_ocr_extracts_scanned_pdf_text_offline(self):
        from tempfile import TemporaryDirectory
        import subprocess

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / "scan.pdf"
            subprocess.run(
                ["swift", str(PROJECT_ROOT / "tests" / "create_scanned_pdf.swift"), str(source_file)],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )
            with patch.object(retrieval, "SOURCE_DIR", Path(directory)):
                matches = retrieval.find_relevant_sources("What does chlorophyll do?")

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "scan.pdf — Page 1 (OCR)")
        self.assertIn("chlorophyll absorbs light energy", matches[0]["text"].lower())

    async def test_local_source_can_be_added_and_listed(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir), patch.object(retrieval, "SOURCE_DIR", source_dir):
                response = await self.client.post(
                    "/sources",
                    json={"filename": "biology.md", "content": "# Plants\nPlants use sunlight to make food."},
                )
                rtf_response = await self.client.post(
                    "/sources",
                    json={"filename": "notes.rtf", "content": r"{\rtf1\ansi Photosynthesis.}"},
                )
                listed = await self.client.get("/sources")
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json(), {"added": "biology.md", "sources": ["biology.md"]})
                self.assertEqual(rtf_response.status_code, 201)
                self.assertEqual(listed.json(), {"sources": ["biology.md", "notes.rtf"]})
                self.assertEqual((source_dir / "biology.md").read_text(encoding="utf-8"), "# Plants\nPlants use sunlight to make food.")

    async def test_local_pdf_upload_accepts_bounded_base64_document(self):
        from tempfile import TemporaryDirectory

        pdf = make_single_page_pdf("Chlorophyll absorbs light energy.")
        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir):
                response = await self.client.post(
                    "/sources",
                    json={"filename": "science.pdf", "content_base64": base64.b64encode(pdf).decode("ascii")},
                )
                self.assertEqual((source_dir / "science.pdf").read_bytes(), pdf)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["sources"], ["science.pdf"])

    @unittest.skipUnless(shutil.which("swift") and sys.platform == "darwin", "macOS Swift and PDFKit are required")
    async def test_local_retrieval_extracts_pdf_page_text_offline(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / "science.pdf"
            source_file.write_bytes(make_single_page_pdf("Chlorophyll absorbs light energy in green leaves."))
            with patch.object(retrieval, "SOURCE_DIR", Path(directory)):
                matches = retrieval.find_relevant_sources("What does chlorophyll do?")

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "science.pdf — Page 1")
        self.assertIn("light energy", matches[0]["text"].lower())

    @unittest.skipUnless(shutil.which("swift") and sys.platform == "darwin", "macOS Swift and PDFKit are required")
    async def test_chat_attachment_extracts_pdf_text_without_saving_it(self):
        from tempfile import TemporaryDirectory

        pdf = make_single_page_pdf("Chlorophyll absorbs light energy in green leaves.")
        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir), patch.object(retrieval, "SOURCE_DIR", source_dir):
                matches = retrieval.find_relevant_document(
                    "What does chlorophyll do?", "science.pdf", pdf
                )
                self.assertEqual(list(source_dir.iterdir()), [])

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "Attached document: science.pdf — Page 1")
        self.assertIn("light energy", matches[0]["text"].lower())

    async def test_local_word_upload_accepts_a_valid_bounded_docx(self):
        from tempfile import TemporaryDirectory

        document = make_docx("Chlorophyll absorbs light energy.")
        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir):
                response = await self.client.post(
                    "/sources",
                    json={"filename": "science.docx", "content_base64": base64.b64encode(document).decode("ascii")},
                )
                self.assertEqual((source_dir / "science.docx").read_bytes(), document)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["sources"], ["science.docx"])

    @unittest.skipUnless(shutil.which("textutil"), "macOS textutil is required for Word extraction")
    async def test_local_retrieval_extracts_word_text_offline(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / "science.docx"
            source_file.write_bytes(make_docx("Chlorophyll absorbs light energy in green leaves."))
            with patch.object(retrieval, "SOURCE_DIR", Path(directory)):
                matches = retrieval.find_relevant_sources("What does chlorophyll do?")

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "science.docx — science")
        self.assertIn("light energy", matches[0]["text"].lower())

    @unittest.skipUnless(shutil.which("textutil"), "macOS textutil is required for Word extraction")
    async def test_chat_attachment_extracts_docx_text_without_saving_it(self):
        from tempfile import TemporaryDirectory

        document = make_docx("Chlorophyll absorbs light energy in green leaves.")
        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir), patch.object(retrieval, "SOURCE_DIR", source_dir):
                matches = retrieval.find_relevant_document(
                    "What does chlorophyll do?", "science.docx", document
                )
                self.assertEqual(list(source_dir.iterdir()), [])

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "Attached document: science.docx — science")
        self.assertIn("light energy", matches[0]["text"].lower())

    async def test_local_source_can_be_removed(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_dir = Path(directory)
            with patch.object(main, "SOURCE_DIR", source_dir):
                (source_dir / "notes.txt").write_text("A local note", encoding="utf-8")
                response = await self.client.delete("/sources/notes.txt")
                listed = await self.client.get("/sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"removed": "notes.txt", "sources": []})
        self.assertEqual(listed.json(), {"sources": []})

    async def test_local_source_upload_rejects_unsupported_files_and_paths(self):
        bad_extension = await self.client.post(
            "/sources", json={"filename": "chapter.pptx", "content": "not supported"}
        )
        unsafe_path = await self.client.post(
            "/sources", json={"filename": "../chapter.md", "content": "note"}
        )
        invalid_docx = await self.client.post(
            "/sources",
            json={"filename": "broken.docx", "content_base64": base64.b64encode(b"not a zip").decode("ascii")},
        )
        self.assertEqual(bad_extension.status_code, 422)
        self.assertEqual(unsafe_path.status_code, 422)
        self.assertEqual(invalid_docx.status_code, 422)

    async def test_ask_forwards_local_request_context(self):
        history = [
            {"role": "user" if index % 2 == 0 else "assistant", "content": f"turn-{index}"}
            for index in range(8)
        ]
        history[2]["image"] = "previous-image-base64"
        mock_gemma = AsyncMock(return_value="उत्तर")
        local_sources = [{"citation": "biology.md — Photosynthesis", "text": "Plants use sunlight."}]
        payload = {
            "question": "What is in this picture?",
            "class_level": "Class 8",
            "subject": "Science",
            "language": "Hindi",
            "image": "current-image-base64",
            "history": history,
        }
        with patch.object(main, "find_relevant_sources", return_value=local_sources) as source_search, patch.object(main, "ask_gemma", new=mock_gemma):
            response = await self.client.post("/ask", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "assistant": "LearnSphere",
            "answer": "उत्तर",
            "sources": ["biology.md — Photosynthesis"],
            "source_excerpts": local_sources,
            "source_based": True,
            "answer_mode": "sourced",
        })
        args = mock_gemma.await_args.args
        self.assertEqual(args[:4], ("What is in this picture?", "Class 8", "Science", "Hindi"))
        self.assertEqual(len(args[4]), 8)
        self.assertEqual(args[4][2]["images"], ["previous-image-base64"])
        self.assertEqual(args[5], "current-image-base64")
        self.assertEqual(args[6], local_sources)

    async def test_ask_reports_ollama_unavailable_without_leaking_transport_details(self):
        mock_gemma = AsyncMock(side_effect=httpx.ConnectError("private connection details"))
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "ask_gemma", new=mock_gemma
        ):
            response = await self.client.post("/ask", json={"question": "Explain a derivative"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["detail"],
            "Could not get an answer from local Ollama. Check that Ollama and Gemma are running, then try again.",
        )
        self.assertNotIn("private connection details", response.text)

    async def test_image_questions_prompt_gemma_to_verify_exact_math_notation(self):
        class MockResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"message": {"content": "The answer is 3^7."}}

        class MockOllamaClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, json):
                self.payload = json
                return MockResponse()

        client = MockOllamaClient()
        with patch.object(gemma.httpx, "AsyncClient", return_value=client):
            answer = await gemma.ask_gemma("Solve the question in this image.", image="image-base64")

        self.assertEqual(answer, "The answer is 3^7.")
        image_message = client.payload["messages"][-1]
        self.assertEqual(image_message["images"], ["image-base64"])
        self.assertIn("transcribe", image_message["content"])
        self.assertIn("do not read 3^7 as 3^37", image_message["content"])

    async def test_ask_extracts_uploaded_document_and_uses_its_excerpts(self):
        document = make_docx("Chlorophyll absorbs light energy.")
        excerpt = {
            "citation": "Attached document: science.docx — science",
            "text": "Chlorophyll absorbs light energy.",
        }
        mock_gemma = AsyncMock(return_value="Chlorophyll captures light.")
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "find_relevant_document", return_value=[excerpt]
        ) as document_search, patch.object(main, "ask_gemma", new=mock_gemma):
            response = await self.client.post(
                "/ask",
                json={
                    "question": "What does chlorophyll absorb?",
                    "document_filename": "science.docx",
                    "document_base64": base64.b64encode(document).decode("ascii"),
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"], [excerpt["citation"]])
        self.assertEqual(mock_gemma.await_args.args[6], [excerpt])
        document_search.assert_called_once_with(
            "What does chlorophyll absorb?", "science.docx", document
        )

    async def test_ask_rejects_invalid_document_attachments(self):
        unsupported = await self.client.post(
            "/ask",
            json={
                "question": "Summarize this",
                "document_filename": "chapter.doc",
                "document_base64": base64.b64encode(b"document").decode("ascii"),
            },
        )
        invalid_docx = await self.client.post(
            "/ask",
            json={
                "question": "Summarize this",
                "document_filename": "chapter.docx",
                "document_base64": base64.b64encode(b"not a Word file").decode("ascii"),
            },
        )
        incomplete = await self.client.post(
            "/ask",
            json={"question": "Summarize this", "document_filename": "chapter.pdf"},
        )
        self.assertEqual(unsupported.status_code, 422)
        self.assertEqual(invalid_docx.status_code, 422)
        self.assertEqual(incomplete.status_code, 422)

    async def test_ask_marks_general_answer_when_no_local_source_matches(self):
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "ask_gemma", new=AsyncMock(return_value="General answer")
        ):
            response = await self.client.post("/ask", json={"question": "Explain photosynthesis"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"], [])
        self.assertEqual(response.json()["source_excerpts"], [])
        self.assertFalse(response.json()["source_based"])
        self.assertEqual(response.json()["answer_mode"], "general")

    async def test_source_only_skips_gemma_when_no_local_source_matches(self):
        mock_gemma = AsyncMock(return_value="This must not be returned")
        with patch.object(main, "find_relevant_sources", return_value=[]), patch.object(
            main, "ask_gemma", new=mock_gemma
        ):
            response = await self.client.post(
                "/ask", json={"question": "Explain photosynthesis", "source_only": True}
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "assistant": "LearnSphere",
            "answer": "I couldn't find this topic in your local notes, so I didn't generate a general answer. Add a note or ask about a topic it covers.",
            "sources": [],
            "source_excerpts": [],
            "source_based": False,
            "answer_mode": "no_source",
        })
        mock_gemma.assert_not_awaited()

    async def test_ask_rejects_unsupported_language(self):
        response = await self.client.post(
            "/ask",
            json={"question": "Explain photosynthesis", "language": "French"},
        )
        self.assertEqual(response.status_code, 422)


    async def test_ask_rejects_blank_question(self):
        response = await self.client.post("/ask", json={"question": "   "})
        self.assertEqual(response.status_code, 422)

    async def test_ask_rejects_question_over_2000_characters(self):
        response = await self.client.post("/ask", json={"question": "x" * 2001})
        self.assertEqual(response.status_code, 422)

    async def test_ask_rejects_more_than_eight_history_turns(self):
        history = [
            {"role": "user", "content": f"turn-{index}"}
            for index in range(9)
        ]
        response = await self.client.post(
            "/ask",
            json={"question": "Explain photosynthesis", "history": history},
        )
        self.assertEqual(response.status_code, 422)

    async def test_local_retrieval_finds_relevant_markdown_heading(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / "biology.md"
            source_file.write_text(
                "# Photosynthesis\nPlants use sunlight, water, and carbon dioxide to make glucose.",
                encoding="utf-8",
            )
            with patch.object(retrieval, "SOURCE_DIR", Path(directory)):
                matches = retrieval.find_relevant_sources("How do plants use sunlight for photosynthesis?")

        self.assertTrue(matches)
        self.assertEqual(matches[0]["citation"], "biology.md — Photosynthesis")
        self.assertIn("glucose", matches[0]["text"])

    async def test_ui_serves_the_built_react_page(self):
        response = await self.client.get("/ui/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("LearnSphere", response.text)
        self.assertIn("/ui/assets/", response.text)


if __name__ == "__main__":
    unittest.main()
