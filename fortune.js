// OpenAI 대신 Claude 사용 시
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
});
const aiData = await response.json();
const content = aiData.content[0].text;
// Vercel Serverless Function

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sun, moon, rising, concern } = req.body;

  if (!sun || !moon) {
    return res.status(400).json({ error: '태양궁과 달궁은 필수입니다.' });
  }

  // ===== 별자리 Knowledge Graph 데이터 =====
  const SIGN_GRAPH = {
    '양자리':   { element: '불', quality: '활동', ruler: '화성', polarity: '양', keywords: ['개척', '열정', '충동', '리더십'], compatible: ['사자자리', '사수자리', '쌍둥이자리', '물병자리'], tension: ['게자리', '염소자리'] },
    '황소자리': { element: '흙', quality: '고정', ruler: '금성', polarity: '음', keywords: ['안정', '감각', '인내', '물질'], compatible: ['처녀자리', '염소자리', '게자리', '물고기자리'], tension: ['사자자리', '물병자리'] },
    '쌍둥이자리':{ element: '바람', quality: '변통', ruler: '수성', polarity: '양', keywords: ['소통', '지식', '적응', '다양성'], compatible: ['천칭자리', '물병자리', '양자리', '사자자리'], tension: ['처녀자리', '사수자리'] },
    '게자리':   { element: '물', quality: '활동', ruler: '달', polarity: '음', keywords: ['감정', '가족', '직관', '보호'], compatible: ['전갈자리', '물고기자리', '황소자리', '처녀자리'], tension: ['양자리', '천칭자리'] },
    '사자자리': { element: '불', quality: '고정', ruler: '태양', polarity: '양', keywords: ['창의', '표현', '자부심', '관대'], compatible: ['양자리', '사수자리', '쌍둥이자리', '천칭자리'], tension: ['황소자리', '전갈자리'] },
    '처녀자리': { element: '흙', quality: '변통', ruler: '수성', polarity: '음', keywords: ['분석', '봉사', '완벽', '건강'], compatible: ['황소자리', '염소자리', '게자리', '전갈자리'], tension: ['쌍둥이자리', '사수자리'] },
    '천칭자리': { element: '바람', quality: '활동', ruler: '금성', polarity: '양', keywords: ['균형', '관계', '미학', '공정'], compatible: ['쌍둥이자리', '물병자리', '사자자리', '사수자리'], tension: ['게자리', '염소자리'] },
    '전갈자리': { element: '물', quality: '고정', ruler: '명왕성', polarity: '음', keywords: ['변환', '심층', '집중', '비밀'], compatible: ['게자리', '물고기자리', '처녀자리', '염소자리'], tension: ['사자자리', '물병자리'] },
    '사수자리': { element: '불', quality: '변통', ruler: '목성', polarity: '양', keywords: ['철학', '자유', '모험', '낙관'], compatible: ['양자리', '사자자리', '천칭자리', '물병자리'], tension: ['처녀자리', '쌍둥이자리'] },
    '염소자리': { element: '흙', quality: '활동', ruler: '토성', polarity: '음', keywords: ['야망', '규율', '책임', '현실'], compatible: ['황소자리', '처녀자리', '전갈자리', '물고기자리'], tension: ['양자리', '천칭자리'] },
    '물병자리': { element: '바람', quality: '고정', ruler: '천왕성', polarity: '양', keywords: ['혁신', '독립', '인도주의', '미래'], compatible: ['쌍둥이자리', '천칭자리', '양자리', '사수자리'], tension: ['황소자리', '전갈자리'] },
    '물고기자리':{ element: '물', quality: '변통', ruler: '해왕성', polarity: '음', keywords: ['영성', '공감', '직관', '예술'], compatible: ['게자리', '전갈자리', '황소자리', '염소자리'], tension: ['쌍둥이자리', '처녀자리'] },
  };

  const ASPECT_MAP = {
    0: '합(Conjunction) — 에너지 합일, 강렬한 증폭',
    30: '반육분(Semi-sextile) — 미묘한 조율',
    60: '육분(Sextile) — 부드러운 협력과 기회',
    90: '직각(Square) — 긴장과 도전, 성장의 마찰',
    120: '삼분(Trine) — 천부적 흐름, 자연스러운 조화',
    150: '불합(Quincunx) — 조율이 필요한 긴장',
    180: '대립(Opposition) — 대조와 통합의 과제',
  };

  function getSignIndex(sign) {
    return Object.keys(SIGN_GRAPH).indexOf(sign);
  }

  function getAspect(s1, s2) {
    const i1 = getSignIndex(s1), i2 = getSignIndex(s2);
    const diff = Math.abs(i1 - i2);
    const angle = Math.min(diff, 12 - diff) * 30;
    const angles = [0, 30, 60, 90, 120, 150, 180];
    const closest = angles.reduce((a, b) => Math.abs(b - angle) < Math.abs(a - angle) ? b : a);
    return ASPECT_MAP[closest] || '미묘한 연결';
  }

  function getElementRelation(e1, e2) {
    const friendly = { '불': ['불','바람'], '흙': ['흙','물'], '바람': ['바람','불'], '물': ['물','흙'] };
    const tension = { '불': ['물','흙'], '흙': ['바람','불'], '바람': ['흙','물'], '물': ['불','바람'] };
    if (e1 === e2) return '동일 원소 — 자연스러운 공명';
    if (friendly[e1]?.includes(e2)) return '상생 원소 — 시너지 효과';
    if (tension[e1]?.includes(e2)) return '충돌 원소 — 성장을 위한 긴장';
    return '중성 관계';
  }

  // ===== 그래프 관계 데이터 구성 =====
  const sunData = SIGN_GRAPH[sun];
  const moonData = SIGN_GRAPH[moon];
  const risingData = rising ? SIGN_GRAPH[rising] : null;

  const sunMoonAspect = getAspect(sun, moon);
  const sunMoonElement = getElementRelation(sunData.element, moonData.element);
  const sameRuler = sunData.ruler === moonData.ruler;

  let risingRelations = '';
  if (risingData) {
    risingRelations = `
- 태양궁-상승궁 각도: ${getAspect(sun, rising)}
- 달궁-상승궁 각도: ${getAspect(moon, rising)}
- 상승궁(${rising}): 원소=${risingData.element}, 성질=${risingData.quality}, 지배행성=${risingData.ruler}
- 태양-상승 원소 관계: ${getElementRelation(sunData.element, risingData.element)}
- 달-상승 원소 관계: ${getElementRelation(moonData.element, risingData.element)}`;
  }

  const concernPart = concern ? `\n사용자의 현재 고민/질문: "${concern}"` : '';

  // ===== GraphRAG 스타일 시스템 프롬프트 =====
  const systemPrompt = `당신은 서양 점성술 전문가이자 GraphRAG(지식 그래프 기반 AI 검색) 방식으로 운세를 분석하는 시스템입니다.

GraphRAG 방식이란: 단순히 개별 별자리 정보를 검색하는 것이 아니라, 여러 별자리 노드들 사이의 "관계 엣지(edge)"를 따라 추론 경로를 구성하고, 그 경로에서 발견되는 패턴을 통해 깊은 통찰을 제공하는 방식입니다.

분석 방식:
1. 태양궁(정체성) → 달궁(감정) → 상승궁(외면)을 Knowledge Graph의 세 주요 노드로 취급
2. 각 노드 간의 각도(Aspect), 원소 관계, 지배 행성 공유 여부를 엣지(관계)로 분석
3. 이 관계망을 통해 단순 합산이 아닌, 에너지 흐름의 "경로"를 추적
4. 경로에서 나타나는 긴장과 조화, 증폭과 상쇄를 해석해 심층 운세 생성

반드시 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 순수 JSON만 출력하세요.`;

  const userPrompt = `다음 별자리 관계망 데이터를 GraphRAG 방식으로 분석해주세요:

=== 노드 데이터 ===
- 태양궁(${sun}): 원소=${sunData.element}, 성질=${sunData.quality}, 지배행성=${sunData.ruler}, 키워드=${sunData.keywords.join(',')}
- 달궁(${moon}): 원소=${moonData.element}, 성질=${moonData.quality}, 지배행성=${moonData.ruler}, 키워드=${moonData.keywords.join(',')}
${risingData ? `- 상승궁(${rising}): 원소=${risingData.element}, 성질=${risingData.quality}, 지배행성=${risingData.ruler}, 키워드=${risingData.keywords.join(',')}` : '- 상승궁: 미입력'}

=== 엣지(관계) 데이터 ===
- 태양궁-달궁 각도: ${sunMoonAspect}
- 태양-달 원소 관계: ${sunMoonElement}
- 지배행성 공유: ${sameRuler ? `동일 (${sunData.ruler}) — 에너지 집중` : '다름 — 다양성'}
- 호환 관계: ${sunData.compatible.includes(moon) ? '상호 호환 ✓' : sunData.tension.includes(moon) ? '긴장 관계 △' : '중성'}
${risingRelations}
${concernPart}

=== 출력 형식 (JSON) ===
{
  "path_analysis": "GraphRAG 추론 경로 설명 (200자 내외, 각도와 원소 관계 근거를 구체적으로 언급, 별자리 이름 포함)",
  "deep_reading": "심층 운세 해석 (300-400자, 세 별자리의 관계망에서 나타나는 에너지 흐름, 현재 고민이 있다면 그에 맞춘 구체적 해석, 한국어 서술체)",
  "action_guide": "지금 할 수 있는 개운 행동 3가지 (각 50자 내외, 번호 없이 줄바꿈으로 구분, 별자리 에너지에 맞게 구체적으로)",
  "shop_message": "개운 아이템 추천 문구 (60자 내외, 분석된 별자리 에너지에 맞는 아이템 힌트 포함)"
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      throw new Error('OpenAI API 오류');
    }

    const aiData = await response.json();
    const content = aiData.choices[0].message.content;
    const result = JSON.parse(content);

    return res.status(200).json(result);

  } catch (err) {
    console.error('Fortune API Error:', err);
    return res.status(500).json({ error: '운세 분석 중 오류가 발생했습니다.' });
  }
}
