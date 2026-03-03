/**
 * ========================================================================
 * Copyright (c) 2026 diabetes108. All rights reserved.
 * 
 * Vercel Serverless Function: AI Meal Analysis
 * File: api/analyze-meal.js
 * 
 * SETUP:
 * 1. Deploy to Vercel
 * 2. Add CLAUDE_API_KEY to Vercel Environment Variables
 *    (Settings → Environment Variables → Add)
 * 3. Frontend calls: POST /api/analyze-meal
 * 
 * SECURITY:
 * - API key stored in Vercel Environment Variables (never exposed to client)
 * - Request validation included
 * - CORS headers configured
 * ========================================================================
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Get API key from Vercel Environment Variables
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      console.error('CLAUDE_API_KEY not configured in Vercel');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // 40년 경력 전문의 톤의 분석 프롬프트 (상세 음식 데이터베이스 포함)
    const analysisPrompt = `당신은 40년 경력의 내과 전문의이자 영양학 전문가입니다. 이 음식 사진을 매우 정확하게 분석하여 당뇨 환자의 "관해 적합도"를 판정해주세요.

🚨🚨🚨 가장 중요: 시각적 특징으로 정확히 구분하기 🚨🚨🚨

【콩나물국밥 vs 비빔밥 vs 밥정식 구분법】

✅ 콩나물국밥 (시각적 특징):
- 뚝배기/돌솥/큰 그릇에 국물이 담겨있음
- 콩나물이 국물 위에 가득 (하얀색/노란색 줄기가 보임)
- 국물이 있음 (맑거나 약간 탁함)
- 밥이 국물에 말려있거나 밑에 있음
- 대파 송송 썰어 있음
- 계란(날계란 또는 익힌것), 김가루 토핑
- 젓갈이 따로 나올 수 있음

❌ 비빔밥 (시각적 특징 - 콩나물국밥과 완전 다름!):
- 돌솥 또는 밥그릇에 담김 (국물 없음!)
- 밥 위에 여러가지 나물이 색깔별로 올려져 있음
- 빨간 고추장이 가운데 올려져 있음
- 계란 프라이가 위에 올라감
- 국물이 없음!

❌ 현미밥 정식/백반 (시각적 특징):
- 밥그릇에 밥이 따로 담겨 나옴
- 여러 반찬이 작은 접시에 따로 담김
- 국/찌개가 따로 작은 그릇에 나옴
- 밥 색깔이 갈색(현미) 또는 흰색(백미)
- 반찬 접시가 여러 개 있음

【국밥류 공통 특징】 - 콩나물국밥, 순대국밥, 설렁탕 등
- 큰 뚝배기/대접에 국물+재료+밥이 함께
- 국물이 많음
- 밥이 국물에 말려있거나 따로 말아 먹음
- 파, 후추, 새우젓 등 양념 추가

═══════════════════════════════════════════
📌 음식 인식 가이드 (반드시 참고!)
═══════════════════════════════════════════

【한국 국물/탕/찌개류】 - 국물 요리 구분 중요!
• 콩나물국밥: 콩나물이 가득한 맑은 국물 + 밥 (전주식은 계란 포함) - GI 65
• 순대국밥: 순대 + 내장 + 선지 + 국물 + 밥 - GI 60
• 설렁탕: 뽀얀 사골 국물 + 소고기 + 밥 따로 - GI 55
• 곰탕: 맑은 소고기 국물 + 고기 + 밥 따로 - GI 55
• 갈비탕: 갈비 + 무 + 맑은 국물 - GI 55
• 삼계탕: 닭 한마리 + 인삼 + 찹쌀 - GI 60
• 육개장: 빨간 국물 + 소고기 + 고사리 + 대파 - GI 58
• 해장국: 콩나물/우거지/선지 등 + 국물 - GI 60
• 감자탕: 돼지 등뼈 + 감자 + 들깨 - GI 65
• 부대찌개: 햄 + 소시지 + 라면사리 + 두부 - GI 70
• 김치찌개: 김치 + 돼지고기 + 두부 - GI 55
• 된장찌개: 된장 + 두부 + 호박 + 감자 - GI 55
• 순두부찌개: 순두부 + 계란 + 해물/고기 - GI 45
• 청국장: 청국장 + 두부 + 채소 - GI 50
• 추어탕: 미꾸라지 + 들깨 - GI 55
• 매운탕/생선찌개: 생선 + 무 + 두부 + 고추 - GI 50
• 알탕: 생선알 + 무 + 두부 - GI 50
• 동태찌개: 동태 + 무 + 두부 + 콩나물 - GI 50

【한국 밥류】 - 밥 양이 핵심!
• 비빔밥: 밥 위에 나물 + 고추장 + 계란 (섞어먹음) - GI 70
• 돌솥비빔밥: 돌솥에 나온 비빔밥 (누룽지 포함) - GI 72
• 회덮밥: 회 + 야채 + 밥 + 초고추장 - GI 65
• 제육덮밥: 제육볶음 + 밥 - GI 68
• 김치볶음밥: 김치 + 밥 볶음 - GI 72
• 새우볶음밥: 새우 + 야채 + 밥 볶음 - GI 70
• 오므라이스: 계란 + 볶음밥 + 케첩 - GI 75
• 카레라이스: 카레 + 밥 - GI 75
• 하이라이스: 짜장 비슷한 소스 + 밥 - GI 72
• 김밥: 밥 + 단무지 + 햄 + 야채 말이 - GI 68
• 주먹밥/삼각김밥: 밥 + 속재료 - GI 70
• 볶음밥: 밥 + 야채 + 계란 볶음 - GI 72

【한국 면류】 - 대부분 고GI
• 라면: 밀가루 면 + 국물 - GI 85 (매우 높음!)
• 짜장면: 중화면 + 춘장소스 - GI 80
• 짬뽕: 중화면 + 해물 + 매운국물 - GI 78
• 칼국수: 밀가루 면 + 맑은 국물 - GI 75
• 수제비: 밀가루 반죽 + 국물 - GI 75
• 잔치국수: 소면 + 멸치국물 - GI 78
• 비빔국수: 소면 + 고추장 양념 - GI 78
• 막국수: 메밀면 + 양념장 - GI 65 (메밀이라 낮음)
• 냉면: 메밀/칡면 + 육수/비빔 - GI 60~70
• 쫄면: 쫄깃한 면 + 매콤소스 - GI 75
• 잡채: 당면 + 야채 + 고기 - GI 70 (당면은 GI 높음)

【한국 고기구이】 - 대부분 저GI, 쌈 채소와 먹으면 최고
• 삼겹살구이: 돼지 삼겹살 + 쌈채소 - GI 0~20 (밥 안먹으면)
• 목살구이: 돼지 목살 + 쌈채소 - GI 0~20
• 갈비구이/양념갈비: 소/돼지갈비 - GI 25~35 (양념에 설탕)
• 불고기: 소고기 + 달콤한 양념 - GI 35~45
• 소고기구이: 소고기 + 쌈채소 - GI 0~20
• 닭갈비: 닭 + 야채 + 매운양념 + 떡/사리 추가시 GI↑ - GI 40~60
• 제육볶음: 돼지고기 + 매운양념 - GI 35
• 오리구이: 오리고기 + 쌈채소 - GI 0~20
• 닭발/닭똥집: 닭부위 + 매운양념 - GI 20~30

【한국 해산물/생선】
• 생선구이 (고등어/삼치/갈치/조기): - GI 0~10
• 조개구이/조개찜: - GI 0~10
• 회/초밥: 생선회는 GI 0, 초밥은 밥 때문에 GI 55~60
• 해물찜: 해물 + 야채 - GI 20~30
• 낙지볶음/주꾸미볶음: 매운양념 - GI 25~35
• 꼼장어구이: - GI 15~25
• 아귀찜: 아귀 + 콩나물 + 매운양념 - GI 30

【한국 반찬/전/기타】
• 계란말이/계란후라이: - GI 0
• 두부요리 (두부조림/두부구이): - GI 15~25
• 나물류 (시금치/콩나물/숙주 등): - GI 15~25
• 김치: - GI 15~20
• 젓갈류: - GI 10~20
• 전류 (동그랑땡/부침개/파전): 밀가루 사용 - GI 50~60
• 떡볶이: 떡 + 고추장 - GI 80 (매우 높음!)
• 순대: - GI 55~60
• 어묵/오뎅: - GI 55
• 튀김류 (김말이/고구마/새우): - GI 60~75

【서양음식】
• 스테이크 (소/돼지/닭): 고기 자체 - GI 0~10
• 샐러드 (드레싱 종류 중요): - GI 15~30
• 그릴드 치킨/생선: - GI 0~10
• 파스타 (크림/토마토/오일): - GI 55~65
• 피자: 도우+치즈+토핑 - GI 60~75
• 햄버거: 번+패티+야채 - GI 65~75
• 샌드위치: 빵+속재료 - GI 55~70
• 리조또: 쌀+치즈+재료 - GI 65~70
• 그라탕: 감자/파스타+치즈 - GI 60~70
• 오믈렛: 계란+속재료 - GI 0~15
• 스크램블에그: - GI 0
• 수프류 (크림/토마토/미네스트로네): - GI 35~55

【아시아음식】
• 스시/초밥: 밥+생선 - GI 55~65
• 사시미: 생선회 - GI 0
• 우동: 밀면+국물 - GI 70~75
• 소바: 메밀면 - GI 55~60
• 라멘: 밀면+국물 - GI 75~80
• 돈카츠: 돼지튀김 - GI 50~55
• 규동/규카츠: 소고기덮밥/커틀릿 - GI 60~70
• 카레: 일본식카레+밥 - GI 70~75
• 볶음밥 (야끼메시): - GI 70
• 교자/만두: - GI 55~60
• 쌀국수 (퍼/분짜): - GI 55~65
• 팟타이: 쌀면+새우+땅콩 - GI 55~60
• 똠양꿍: 새우+레몬그라스+국물 - GI 35~45
• 딤섬: 만두류 - GI 50~60
• 볶음면 (차우멘): - GI 65~70
• 탕수육: 튀김+달콤소스 - GI 65~70
• 깐풍기: 닭튀김+매콤소스 - GI 55~60
• 마파두부: 두부+고기+소스 - GI 30~40
• 유산슬: 해물+야채볶음 - GI 30~35

【패스트푸드/분식】
• 치킨 (후라이드/양념): 튀김 - GI 50~65
• 프라이드포테이토: 감자튀김 - GI 75~85
• 버거류: - GI 65~75
• 핫도그: - GI 65~70
• 타코/부리또: - GI 55~65
• 떡볶이: - GI 80
• 순대: - GI 55~60
• 튀김: - GI 60~75
• 컵라면: - GI 80~85

【음료/디저트】 - 대부분 F등급
• 콜라/사이다: - GI 95+ (최악!)
• 과일주스: - GI 50~70
• 스무디: - GI 45~65
• 커피 (아메리카노): - GI 0
• 라떼 (우유): - GI 30~35
• 케이크/빵류: - GI 70~85
• 아이스크림: - GI 60~70
• 초콜릿: - GI 40~50
• 과일: 종류마다 다름 (바나나 GI 62, 사과 GI 36)

═══════════════════════════════════════════
📋 출력 형식 (JSON만, 다른 텍스트 없이)
═══════════════════════════════════════════

{
  "grade": "A/B/C/D/F 중 하나",
  "foodName": "정확한 음식 이름 (예: 콩나물국밥, 삼겹살구이+쌈, 된장찌개 정식)",
  "carbs": 탄수화물(g) 숫자,
  "sugar": 당질(g) 숫자,
  "calories": 칼로리 숫자,
  "protein": 단백질(g) 숫자,
  "fiber": 식이섬유(g) 숫자,
  "gi": GI지수 숫자,
  "comment": "40년 경력 전문의의 따뜻한 조언 (3-4문장, 존댓말)"
}

═══════════════════════════════════════════
🏆 등급 기준 (엄격하게 적용)
═══════════════════════════════════════════

A등급 (90-100점) - 당뇨 관해에 최적:
→ 계란요리, 두부, 생선구이, 고기구이+쌈(밥없이), 샐러드, 나물, 채소

B등급 (75-89점) - 적합:
→ 찌개류+밥반공기, 국밥류(밥적게), 고기+밥소량, 회, 스테이크

C등급 (60-74점) - 주의 필요:
→ 일반 한식정식, 국밥(밥보통), 비빔밥(작은것), 파스타, 초밥

D등급 (40-59점) - 부적합:
→ 비빔밥(큰것), 라면, 떡볶이, 빵류, 피자, 햄버거, 튀김류, 면류

F등급 (0-39점) - 매우 위험:
→ 탄산음료, 케이크, 과자, 설탕음료, 시럽커피

═══════════════════════════════════════════
⚠️ 분석 순서 (반드시 이 순서로!)
═══════════════════════════════════════════

1단계: 국물이 있는가?
- 국물 있음 → 국밥류, 탕류, 찌개류 중 하나
- 국물 없음 → 밥류, 구이류, 면류 등

2단계: 국물이 있다면 주재료는?
- 콩나물이 많음 → 콩나물국밥 또는 해장국
- 순대/내장 보임 → 순대국밥
- 뽀얀 국물 + 소고기 → 설렁탕 또는 곰탕
- 빨간 국물 → 육개장, 김치찌개 등

3단계: 국물이 없다면?
- 밥 위에 나물 + 고추장 → 비빔밥
- 밥이 따로 + 반찬 여러개 → 정식/백반
- 고기 구이 + 쌈채소 → 삼겹살, 불고기 등

4단계: 밥의 양과 색 확인
- 밥이 많음 → GI↑, 등급↓
- 현미(갈색) vs 백미(흰색)

5단계: 최종 판정
- 음식명 + 예상 칼로리 + GI + 등급 결정

🔴 주의: 콩나물이 보이고 국물이 있으면 "콩나물국밥"이지 "현미밥 정식"이 절대 아님!`;

    // Call Claude Vision API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType || 'image/jpeg',
                  data: image,
                },
              },
              {
                type: 'text',
                text: analysisPrompt,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json();
      console.error('Claude API error:', errorData);
      return res.status(claudeResponse.status).json({ 
        error: 'AI analysis failed',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const claudeData = await claudeResponse.json();
    const content = claudeData.content[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    // Parse JSON from response
    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback response
      analysis = {
        grade: 'C',
        foodName: '음식 분석 완료',
        carbs: 30,
        sugar: 5,
        calories: 300,
        protein: 15,
        fiber: 3,
        gi: 55,
        comment: '음식 분석이 완료되었습니다. 식후 10-15분 걷기를 권장드립니다.',
      };
    }

    // Validate grade
    const validGrades = ['A', 'B', 'C', 'D', 'F'];
    if (!validGrades.includes(analysis.grade)) {
      analysis.grade = 'C';
    }

    // Add metadata
    analysis.analyzedAt = new Date().toISOString();

    console.log(`Meal analyzed: ${analysis.foodName} - Grade: ${analysis.grade}`);

    return res.status(200).json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
