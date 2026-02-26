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

  const systemPrompt = `당신은 서양 점성술 전문가입니다. 반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트나 마크다운 없이 순수 JSON만 출력하세요. 모든 텍스트는 완전한 한국어 유니코드로 작성하세요.

출력 형식 (반드시 이 키 4개만 포함):
{"path_analysis":"별자리 관계 분석 200자","deep_reading":"심층 운세 해석 300자","action_guide":"1. 첫번째 행동\n2. 두번째 행동\n3. 세번째 행동","shop_message":"개운 메시지 60자"}

주의사항:
- action_guide는 번호 매긴 3가지를 \n으로 구분
- 특수문자 대신 일반 한국어 사용
- 이모지 사용 가능
- JSON 외 다른 텍스트 절대 금지`;

  const concernText = concern ? `\n사용자 고민: "${concern}"` : '';
  const risingText  = risingD
    ? `\n상승궁(${rising}): ${risingD.element}·${risingD.quality}, ${risingD.ruler} 지배, ${risingD.keywords.join('·')}`
    : '';

  const userPrompt = `GraphRAG 방식으로 세 별자리의 관계망을 분석하세요.

태양궁(${sun}): ${sunD.element}·${sunD.quality}, ${sunD.ruler} 지배, ${sunD.keywords.join('·')}
달궁(${moon}): ${moonD.element}·${moonD.quality}, ${moonD.ruler} 지배, ${moonD.keywords.join('·')}${risingText}${concernText}`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
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

          // JSON 추출 (마크다운 코드블록 대응)
          const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw;
          const result  = JSON.parse(jsonStr);

          res.status(200).json(result);
          resolve();
        } catch (e) {
          console.error('파싱 오류:', e, 'Raw:', data);
          res.status(500).json({ error: '⚠️ AI 응답 처리 오류. 다시 시도해주세요.', debug: data.substring(0, 200) });
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
