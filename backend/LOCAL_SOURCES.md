# Local study sources

Use **Notes** in the study page to add, view, and remove study material you are
allowed to use as `.md`, `.txt`, `.rtf`, `.pdf`, or `.docx`, or place those files in this folder. LearnSphere
searches those files on this Mac, sends only matching excerpts
to Ollama at `localhost:11434`, and names the matched file and section in its
answer. No files are uploaded to a cloud service.

This version reads UTF-8 text and Markdown and extracts RTF text with macOS
`textutil`. Text, Markdown, and RTF files can be up to 1 MB; PDF and Word files can be up to
10 MB; PDFs are read with PDFKit. PDF extraction reads at
most 250 pages and 5 MB of text per file. Scanned PDFs use on-device Vision OCR
for up to 50 pages. Chat attachments are extracted temporarily and are not added
to the saved local source library; relevant excerpts are sent only to local Ollama.
Word (`.docx`) text is extracted with macOS `textutil` after size and archive checks. If no relevant excerpt
is found, LearnSphere labels its reply as general Gemma knowledge rather than a
locally sourced answer.
