export const PROMPTS: Record<string, string> = {
  suncatcher: `You are a professional designer creating artwork for a 2D ornament for the Etsy print-on-demand market.
    Using the provided reference image, carefully analyze and preserve the original material feel (such as ceramic, acrylic, wood, glass, or others), including its surface texture, reflectivity, shading style, and light behavior. Maintain the exact same mood, tone, and lighting atmosphere from the reference — including color harmony, brightness, softness, and emotional expression.
    Design requirements:
    A photorealistic image of source competior, placed naturally on surface.
    Realistic photography style, natural lighting, soft shadows, high detail, real textures, sharp focus.
    NOT vector, NOT illustration, NOT flat design, NOT cartoon, NOT clipart.
    Lifestyle photography, premium quality, clean background, depth of field.
    Maintain the product format: a photorealistic ornament
    Preserve the original material simulation (e.g., glossy ceramic shine, translucent acrylic glow, matte wood texture, etc.)
    A photorealistic image of the SAME shape as the original reference.
    Only redesign artwork on the surface of the shape: (texting, texture, colors, lighting, pet, person, pattern, flowers, trees, plants, sun, moon, landscape or objects depicted on the ornament) NOT change artwork type
    A photorealistic image of the SAME shape as the original reference.
    Keep the exact shape structure, proportions, perspective, and material unchanged.
    Keep the exact same line on surface.
    Keep the same lighting direction and intensity, including highlights, shadows, and overall ambiance
    Keep the same surface, object placement, and compostion structure as the reference image
    Retain the original art style and rendering technique (line weight, shading style)
    Redesign the character's appearance (e.g., change the pet breed, person's hairstyle, flowers, objects, trees, plants, landscape, mountains, or objects depicted on the ornament)
    while maintaining the same overall vibe and emotional tone, keep same type of character (e.g., if it's a pet, keep it a pet; if it's a person, keep it a person)
    Ensure the character remains the clear focal point and feels naturally integrated into the existing design language
    Style direction:
    Match the original realphoto style as closely as possible ( painterly, semi-realistic, etc.)
    Keep edges crisp and shapes well-defined for print clarity
    Ensure colors and shading interact naturally with the detected material type
    Output instructions:
    Show only the ornament artwork
    Centered on a background
    No mockup, no rope, no product photography
    No watermarks, no borders, no logos
    High resolution, print-ready design`,
  combostickerAnalyze: `🧠 ROLE
    You are a creative visual-intelligence AI assistant whose main function is to craft one clear, vivid, and well-structured image-generation prompt for producing a single sticker design. This prompt must be based on a thorough visual and emotional analysis of the provided images.
    🎯 OBJECTIVE
    Analyze the uploaded image and return a structured JSON object containing the style analysis and object list.
    STEP 1 – Analyze Visuals
    Examine the input image. Identify design traits, color trends, emotional cues, and visual language that resonate with potential buyers.
    STEP 2 – Craft Style Prompt (for the "style" field)
    Compose a single natural-language prompt that clearly instructs an image model to create a sticker with this style.
    This description MUST include:
    - Vector art style (clean, scalable lines)
    - Bold, thick outlines
    - Sharp resolution and clarity
    - Square layout, fully visible (no cropping)
    - The specific artistic theme, motifs, and moods of the input.
    STEP 3 – Extract Objects
    List all distinct objects found in the image (e.g. separate stickers on the sheet).
    🧾 OUTPUT FORMAT
    Return ONLY valid JSON. Do not include markdown formatting.
    {
      "theme": "string",
      "style": "string",
      "objects": ["string", "... total 30 items"],
      "colorPalette": ["string", "string", ...]
    }
    ⚠️ STRICT RULES
    - The "objects" array MUST contain EXACTLY 30 items (no more, no less).
    - If fewer objects are found in the image, you MUST generate additional ones that fit the theme.
    - Output must be valid JSON only.`,


  combostickerGenerate: `DESIGN REQUIREMENTS:- A single, complete illustration.  - Centered and fully visible. - ONLY ONE OUTLINE: THICK WHITE OUTLINE (Sticker Die-Cut). - NO black outline.- NO double outline.- NO shadow border.- NO stroke outside the white outline.- White outline must be smooth, even thickness, and clean vector edge.- Surround the entire sticker shape clearly.STYLE & VISUAL:- Vector-style illustration.- Bold, clean shapes.- High contrast colors.- Smooth curves.- Crisp edges.- Cute / trendy / expressive.- Print-ready quality (No blur, no noise).STRICTLY AVOID:- Black outline.- Dark stroke outside the sticker.- Glow effects.- Drop shadows.- Background elements.- Text / Watermarks.TECHNICAL REQUIREMENT:- Generate on a SOLID BLACK BACKGROUND (HEX #000000).- The white outline must contrast clearly against the black background for automatic removal.- Do NOT generate a checkerboard or transparent background. Use PURE BLACK.SAFETY & COPYRIGHT RULES:- DO NOT generate any trademarked logos, characters, brand names, or copyrighted imagery.- Create original artwork`,

  combostickerGenerate_old: `You are a professional sticker designer for Etsy and Amazon print-on-demand products.
    Create a brand new standalone sticker illustration based on the provided combo image reference and the extracted object.
    Requirements:
    - Generate a single isolated sticker design for one object only.
    - Output exactly ONLY ONE sticker (count = 1).
    - Never generate a sticker sheet, collage, bundle, or multiple variants in one image.
    - Do not duplicate the subject or add extra separate sticker elements.
    - If the source image is a combo/sheet, isolate only the requested object and ignore all other stickers.
    - Result must contain one main subject silhouette only.
    - Keep the subject centered and fully visible.
    - Use the analyzed theme, style, vibe, and color palette as guidance.
    - Respect the user keyword/context when provided.
    - Clean edges, print-ready composition, no background scene, no mockup, no text, no watermark.`,

  lifestyleAnalyze: `Bạn là AI Agent chuyên "analyze image" để rút ra insight marketing và gợi ý bối cảnh lifestyle/mockup phù hợp.
    Nhiệm vụ: nhìn vào hình ảnh được cung cấp (thường là design/graphic/packaging) và suy luận hợp lý về đối tượng, lợi ích, cảm xúc, mood/vibe, props và bối cảnh.
    Nguyên tắc:
    - Chỉ dựa trên tín hiệu thị giác (chữ trên design, biểu tượng, màu sắc, phong cách minh hoạ, chất liệu giả định, bối cảnh gợi ý).
    - Không bịa chi tiết quá cụ thể. Nếu không chắc, ghi "Chưa đủ dữ liệu" và đưa 1–2 giả định hợp lý kèm mức độ tin cậy (Cao/Trung bình/Thấp).
    - Không nhận diện danh tính người thật trong ảnh.
    - Trả về đúng định dạng output bên dưới, ngắn gọn, dùng tiếng Việt, ưu tiên ý thực dụng cho việc dựng ảnh mockup lifestyle.
    - Không sử dụng hình ảnh của các thương hiệu Trademark (Ví dụ Pepsi, Budweiser,...)
    Cách phân tích (tóm tắt):
    1) Xác định "chủ đề" và "tín hiệu" của design: đối tượng/biểu tượng chính, style (retro, premium, minimal, streetwear…), bảng màu (ấm/lạnh), font/typography, thông điệp chữ.
    2) Suy ra nhóm người phù hợp (persona) và bối cảnh tiêu dùng phù hợp.
    3) Chuyển hoá thành: lợi ích (functional/expressive), cảm xúc, mood/vibe, props và bối cảnh.

    OUTPUT (bắt buộc đúng các mục, mỗi mục 1–3 dòng):
    Insight sản phẩm:
    - Đối tượng: [mô tả persona cụ thể: độ tuổi/gu/phong cách sống/sở thích liên quan]
    - Lợi ích chính: [1–3 lợi ích: thể hiện cá tính / quà tặng / tạo cảm giác…; nếu là áo/đồ dùng thì nêu "lý do mua"]
    - Cảm xúc muốn tạo: [chọn 1–3: tin cậy / chill / premium / năng lượng / tối giản / vui nhộn / hoài cổ / phiêu lưu ...]
    - Mood & vibe: {3–6 tính từ, ngăn cách bằng dấu phẩy}
    - Props: {3–6 đạo cụ liên quan, ngăn cách bằng dấu phẩy}
    - Bối cảnh mong muốn: [1 bối cảnh chính + 1 bối cảnh phụ (tuỳ chọn), ví dụ: quán cà phê / phòng gym / bếp nhà / ngoài trời / văn phòng / cửa hàng / studio set]

    Ghi chú (tuỳ chọn, 1 dòng):
    - Mức độ tin cậy: [Cao/Trung bình/Thấp] + [lý do ngắn: "vì có biểu tượng…, tone màu…"]`,
  lifestyleGenerate: `Mockup lifestyle chân thực (photorealistic) cho '{{keyword}}' chất lượng cao, với design được cung cấp áp lên vị trí in/nhãn; bản in/nhãn phải cực kỳ sắc nét, cân giữa, đúng màu & layout gốc, viền sạch, không méo/nhăn, không bị che khuất, không thêm chữ/logo. Bối cảnh: {{boi_canh}}. Nhân vật: {{doi_tuong}} đang hành động tự nhiên (ưu tiên pose giúp thấy rõ sản phẩm; sản phẩm là hero). Mood & vibe: {{mood_vibe}}. Props: {{props}} (chỉ bổ trợ, không che thiết kế, không sử dụng hình ảnh bản quyền thương hiệu cũng như text như instax, pepsi,...). Lighting: ánh sáng đúng bối cảnh, bóng đổ thật, không lóa che vùng in/nhãn, cinematic depth of field. Composition: hero focus vào vùng in/nhãn, thiết kế nhìn thấy 100%, rule of thirds, 35mm lens, shallow DOF, commercial lifestyle photography, ultra realistic, high detail, natural look, clean bokeh background, high resolution.
    NEGATIVE PROMPT:
    blurry, low quality, warped print/label, distorted design, unreadable text, wrong colors, extra typography, extra text, watermark, random logo, harsh glare covering design, messy background, overexposed, underexposed, low contrast, oversaturated, bad anatomy, extra fingers, deformed hands, duplicated limbs`,
  holographicOrnament: `You are a professional designer creating photorealistic 2D ornament artwork for Etsy print-on-demand.

CORE REQUIREMENTS
Generate a photorealistic image based on the reference.
The result must look like real product photography.
SHAPE & STRUCTURE (LOCKED)
Keep the EXACT object shape, proportions, perspective, and material.
Do NOT modify the physical object.
LIGHTING & COMPOSITION
Match original lighting, shadows, and highlights.
Maintain the same composition and placement.
Use a clean, minimal background.
SUBJECT REDESIGN (CRITICAL)
You MUST redesign the original subject.
Do NOT reuse or copy the original artwork.
The new subject must be a redesigned version of the original.
SUBJECT CATEGORY RULE (MANDATORY)
Person → must remain a person
Animal → must remain the same type of animal
Object → must remain an object
NO category transformation
REDESIGN LIMITS
You may adjust:
pose
outfit
expression
visual presentation (still photorealistic)
Do NOT change the core identity
STRICT NEGATIVE RULES
No additional subjects
No extra animals
No props
No background elements
No scene expansion
STYLE CONTROL
Photorealistic
Natural lighting
Real textures
NOT cartoon, NOT illustration
OUTPUT
Single image only
High resolution, print-ready
No watermark, no text, no border, no logo`,
}
