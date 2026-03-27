# Lifestyle full response display fix

## Flow mới (2 bước)

### Bước 1 – Analyze
- Gửi ảnh `2. FINAL CONCEPT REDESIGN` + prompt `PROMPTS.lifestyleAnalyze` + `analysis_count: 3` lên `/gemini/lifestyle`.
- Backend trả về `{ analyses: [{ analysis_index, analysis: { "Insight sản phẩm": {...} } }, ...] }`.

### Bước 2 – Generate (song song)
- Với mỗi analysis, trích xuất `Đối tượng`, `Bối cảnh mong muốn`, `Mood & vibe`, `Props`.
- Build prompt từ template `PROMPTS.lifestyleGenerate` (thay thế `{{keyword}}`, `{{boi_canh}}`, `{{doi_tuong}}`, `{{mood_vibe}}`, `{{props}}`).
- Gửi song song 3 yêu cầu generate ảnh lên `/gemini/lifestyle` với `responseModalities: ['IMAGE', 'TEXT']`.
- Trả về `{ images: [{ base64, mimeType, insight, generatePrompt }], analyses, raw }`.

## Helper functions (geminiService.js)
- `extractInsightFromAnalysis(analysis)` – parse insight từ cả snake_case (`insight_san_pham`) lẫn key tiếng Việt.
- `buildLifestyleGeneratePrompt(keyword, insight)` – build prompt từ template bằng string `.replace()`.
- `extractAnalysesFromResponse(responseData)` – lấy `analyses[]` từ backend.

## UI (HoloarcylicPage & SuncatcherPage)
- Truyền `keyword: data[globalIndex]?.keyword` vào `generateLifestyleImage`.
- State `lifestyleResults[idx]` lưu thêm `analyses[]`.
- Card Lifestyle hiển thị 3 ảnh (grid 2 cột).
- Phía dưới các ảnh có accordion `Analysis 1/2/3` — click để xem insight chi tiết.

## Prompts.ts
- `lifestyleAnalyze` – prompt phân tích ảnh marketing.
- `lifestyleGenerate` – template prompt generate ảnh lifestyle với placeholders.
