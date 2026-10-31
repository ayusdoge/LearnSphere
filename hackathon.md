# LearnSphere — One AI Tutor. Endless Learning Possibilities.

## Hacktoberfest 2026 | Hack Day Sonipat

### Team Information

**Team Name:** Monster Energy

**Team Members:**
1. Ayush Rawat
2. Yuvraj Rai
3. Samar Sethi

**Selected Problem Statement:** Problem Statement 08 — Build Anything with Gemma 4: Local AI Innovation Challenge

**Project Name:** LearnSphere

**Category:** Generative AI | Offline Education | Local AI | Educational Technology

---

## 1. Project Overview

LearnSphere is an AI-powered educational platform designed to make quality education accessible to everyone, especially students in rural and underserved communities where reliable internet connectivity is limited.

Our goal is to develop a unified, intelligent learning companion that helps students understand concepts, practise questions, prepare for examinations, learn programming, and explore different subjects without depending on cloud-based AI services.

Powered by Google's Gemma 4 model running locally, LearnSphere aims to provide personalised educational assistance while prioritising accessibility, privacy, and offline functionality.

**Our Mission:** Make intelligent learning assistance accessible beyond the limitations of internet connectivity and geographical location.

## 2. Problem Statement

Students can face barriers to quality educational resources, particularly in areas with unreliable internet connectivity and limited access to personalised academic support.

Many AI-powered educational tools depend on continuous internet access and cloud-based processing, making them less suitable for students in low-connectivity environments.

LearnSphere aims to address this challenge by exploring how locally running AI models can deliver useful educational assistance without relying on cloud AI infrastructure.

## 3. Proposed Solution

LearnSphere will provide a single AI-powered learning platform capable of assisting students across multiple subjects and educational activities.

Instead of requiring students to switch between different tools for explanations, notes, quizzes, and programming assistance, LearnSphere aims to bring these capabilities together in one unified learning environment.

The core AI functionality will be powered by Gemma 4 running locally through Ollama, allowing the application to process educational queries without sending them to external AI services.

## 4. Planned Key Features

### AI Learning Assistant
A unified AI assistant for answering academic questions, providing explanations, and supporting independent learning.

### Concept Explanation
Break down complex topics into simple, step-by-step explanations supported by relevant examples.

### Smart Notes
Generate concise summaries, structured revision notes, and topic-based study materials.

### Practice and Quizzes
Create multiple-choice questions, topic-based exercises, and practice tests to support active learning.

### Programming Support
Help students understand programming concepts, interpret errors, and practise coding.

### Study Material Assistance
Allow students to interact with locally available textbooks, PDFs, and educational resources.

### Personalised Learning
Adapt explanations, examples, and learning support according to students' questions and learning preferences.

### Offline Accessibility
Enable local AI inference and access to locally stored educational resources without requiring continuous internet connectivity.

## 5. AI Model Selection and Justification

**Selected AI Model:** Google Gemma 4

**Planned Model Variant:** `gemma4:e4b`

**Execution Environment:** Ollama

**Inference Mode:** Local, on-device AI inference

### Why Gemma 4?

- **Offline Capability:** Gemma 4 can run locally, allowing educational assistance without cloud-based AI inference.
- **Accessibility:** Smaller model variants offer a practical starting point for developing AI applications on consumer laptops.
- **Privacy:** Educational queries can be processed locally without transmitting them to external AI services.
- **Versatility:** A general-purpose language model can support explanations, summarisation, question generation, and programming assistance.
- **Hackathon Compatibility:** Gemma 4 aligns with the mandatory model requirements of Problem Statement 08.

The final model configuration will be selected based on local hardware compatibility, memory requirements, and inference performance.

No Gemini API, cloud-based AI inference service, or additional AI model will be used.

## 6. Proposed Technical Approach

LearnSphere will follow a local-first architecture:

1. Students interact with the LearnSphere application through a user-friendly interface.
2. The application processes learning requests and prepares relevant context.
3. Locally available educational resources are retrieved when needed.
4. Gemma 4, running through Ollama, generates the educational response.
5. The application displays explanations, notes, quizzes, or programming guidance to the student.

The architecture is intended to support offline operation after the required software, model weights, and educational resources have been installed.

## 7. Intended Users

LearnSphere is designed primarily for:

- Students in rural and underserved communities.
- Learners with unreliable internet connectivity.
- Students seeking affordable academic assistance.
- Self-learners exploring new subjects and skills.
- Educational institutions interested in local AI-powered learning tools.

## 8. Future Scope

Beyond the initial hackathon prototype, LearnSphere may explore:

- Multilingual learning assistance.
- Curriculum-aligned educational content.
- Student progress tracking.
- Shared local AI infrastructure for schools and community learning centres.
- Lightweight interfaces for affordable devices.
- Offline educational resource libraries.

These are future development directions and are not claimed as completed hackathon features.

## 9. Project Vision

We believe quality education should not be limited by geographical location, financial circumstances, or internet connectivity.

LearnSphere aims to make intelligent educational support more accessible, inclusive, and independent by bringing AI-powered learning capabilities closer to students.

Our long-term vision is to build an educational ecosystem where learners can access meaningful academic guidance even in environments with limited connectivity.

**One assistant. Every subject. Learning without limits.**

---

**Team Monster Energy**  
**Hacktoberfest 2026 — Problem Statement 08: Gemma 4 Local AI Innovation Challenge**
