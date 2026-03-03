// api/fortune.js

const https = require('https');

module.exports = async function (req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sun, moon, rising, concern } = req.body || {};

  if (!sun || !moon) {
    return res.status(400).json({ error: '태양궁과 달궁을 선택해주세요.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '❌ ANTHROPIC_API_KEY 환경변수가 없습니다. Vercel Settings > Environment Variables에 추가해주세요.' });
  }

  // ===== 별자리 데이터 =====
  const SIGNS = {
    '양자리':    { element:'불',   quality:'활동', ruler:'화성',   keywords:['열정','개척','충동','리더십'] },
    '황소자리':  { element:'흙',   quality:'고정', ruler:'금성',   keywords:['안정','감각','인내','현실'] },
    '쌍둥이자리':{ element:'바람', quality:'변통', ruler:'수성',   keywords:['소통','지식','다양성','재치'] },
    '게자리':    { element:'물',   quality:'활동', ruler:'달',     keywords:['감정','가족','보호','직관'] },
    '사자자리':  { element:'불',   quality:'고정', ruler:'태양',   keywords:['창의','표현','자부심','관대'] },
    '처녀자리':  { element:'흙',   quality:'변통', ruler:'수성',   keywords:['분석','봉사','완벽','건강'] },
    '천칭자리':  { element:'바람', quality:'활동', ruler:'금성',   keywords:['균형','관계','미학','공정'] },
    '전갈자리':  { element:'물',   quality:'고정', ruler:'명왕성', keywords:['변환','심층','집중','비밀'] },
    '사수자리':  { element:'불',   quality:'변통', ruler:'목성',   keywords:['자유','모험','철학','낙관'] },
    '염소자리':  { element:'흙',   quality:'활동', ruler:'토성',   keywords:['야망','규율','책임','현실'] },
    '물병자리':  { element:'바람', quality:'고정', ruler:'천왕성', keywords:['혁신','독립','인도주의','미래'] },
    '물고기자리':{ element:'물',   quality:'변통', ruler:'해왕성', keywords:['영성','공감','직관','예술'] },
  };

  const sunD    = SIGNS[sun]    || { element:'?', quality:'?', ruler:'?', keywords:[] };
  const moonD   = SIGNS[moon]   || { element:'?', quality:'?', ruler:'?', keywords:[] };
  const risingD = rising ? (SIGNS[rising] || null) : null;

  const systemPrompt = `점성술 운세 분석가입니다. 반드시 아래 형식의 JSON 하나만 출력하세요.

{
  "path_analysis": "여기에 세 별자리 관계 분석 200자",
  "deep_reading": "여기에 심층 운세 해석 300자",
  "action_guide": "1. 첫번째 개운 행동\n2. 두번째 개운 행동\n3. 세번째 개운 행동"
}

JSON만 출력. 앞뒤 설명 없음. 마크다운 없음.`;

  const concernText = concern ? `\n사용자 고민: "${concern}"` : '';
  const risingText  = risingD
    ? `\n상승궁(${rising}): ${risingD.element}·${risingD.quality}, ${risingD.ruler} 지배, ${risingD.keywords.join('·')}`
    : '';

  const userPrompt = `GraphRAG 방식으로 세 별자리의 관계망을 분석하세요.

태양궁(${sun}): ${sunD.element}·${sunD.quality}, ${sunD.ruler} 지배, ${sunD.keywords.join('·')}
달궁(${moon}): ${moonD.element}·${moonD.quality}, ${moonD.ruler} 지배, ${moonD.keywords.join('·')}${risingText}${concernText}`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve) => {
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) {
            console.error('Claude API 오류:', response.statusCode, data);
            let errMsg = '❌ Claude API 오류 (' + response.statusCode + ')';
            if (response.statusCode === 401) errMsg = '❌ API 키가 올바르지 않습니다. Vercel의 ANTHROPIC_API_KEY를 확인하세요.';
            if (response.statusCode === 429) errMsg = '⚠️ API 호출 한도 초과. 잠시 후 다시 시도해주세요.';
            res.status(500).json({ error: errMsg });
            return resolve();
          }

          const aiData = JSON.parse(data);
          const raw = aiData.content[0].text.trim();

          console.log('[fortune.js] raw 응답:', raw.substring(0, 300));

          // JSON 추출 — 3단계 시도
          let result = null;

          // 1단계: 마크다운 코드블록
          const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (mdMatch) {
            try { result = JSON.parse(mdMatch[1].trim()); } catch(e1) {}
          }

          // 2단계: { } 사이 JSON 추출
          if (!result) {
            const objMatch = raw.match(/(\{[\s\S]*\})/);
            if (objMatch) {
              try { result = JSON.parse(objMatch[1].trim()); } catch(e2) {}
            }
          }

          // 3단계: 그냥 raw 파싱
          if (!result) {
            try { result = JSON.parse(raw.trim()); } catch(e3) {}
          }

          // 모두 실패 → 기본값
          if (!result) {
            result = {};
            console.error('[fortune.js] JSON 파싱 완전 실패. raw:', raw.substring(0, 500));
          }

          // 필수 키 보장
          if (!result.path_analysis) result.path_analysis = '별자리 에너지가 복잡하게 얽혀 있습니다. 잠시 후 다시 시도해주세요.';
          if (!result.deep_reading)  result.deep_reading  = '운세의 흐름을 읽는 중입니다. 다시 시도해주세요.';
          if (!result.action_guide)  result.action_guide  = '1. 명상으로 내면을 정돈하세요\n2. 자연 속에서 에너지를 충전하세요\n3. 소중한 사람과 시간을 보내세요';

          res.status(200).json(result);
          resolve();
        } catch (e) {
          console.error('[fortune.js] 전체 오류:', e.message);
          res.status(200).json({
            path_analysis: '운세 분석 중 오류가 발생했습니다. 다시 시도해주세요.',
            deep_reading:  '잠시 후 다시 시도해 주세요.',
            action_guide:  '1. 깊게 숨을 쉬고 내면의 소리에 귀 기울여 보세요\n2. 오늘 감사한 것 3가지를 적어보세요\n3. 소중한 사람에게 연락해 보세요'
          });
          resolve();
          return;
          // 에러 표시 미사용: ⚠️ AI 응답 처리 오류. 다시 시도해주세요.', debug: data.substring(0, 200) });
          resolve();
        }
      });
    });

    request.on('error', (e) => {
      console.error('네트워크 오류:', e);
      res.status(500).json({ error: '⚠️ 네트워크 오류: ' + e.message });
      resolve();
    });

    request.write(body);
    request.end();
  });
};
