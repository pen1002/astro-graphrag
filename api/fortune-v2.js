// api/fortune-v2.js
// ═══════════════════════════════════════════════════════════════
//  🌌 별자리 운명의 그물 v2 — 생년월일 자동 계산 엔진
//  기존 fortune.js 완전 보존 / 이 파일만 새로 추가
//  외부 라이브러리 없음 — 순수 JS 천문 계산
// ═══════════════════════════════════════════════════════════════

const https = require('https');

// ──────────────────────────────────────────
//  천문 계산 엔진 (Swiss Ephemeris 근사치)
// ──────────────────────────────────────────

/**
 * 율리우스 적일(Julian Day Number) 계산
 */
function toJulianDay(year, month, day, hour = 0) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jdn = day + Math.floor((153 * m + 2) / 5)
    + 365 * y + Math.floor(y / 4) - Math.floor(y / 100)
    + Math.floor(y / 400) - 32045;
  return jdn - 0.5 + hour / 24;
}

/**
 * 태양 황경(ecliptic longitude) 계산
 * 정확도: ±0.01° (실용적 정밀도)
 */
function calcSunLongitude(jd) {
  const n   = jd - 2451545.0;           // J2000.0 기준 일수
  const L   = (280.460 + 0.9856474 * n) % 360;
  const g   = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
  const lam = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  return ((lam % 360) + 360) % 360;
}

/**
 * 달 황경 계산
 * 정확도: ±0.3° (실용 수준)
 */
function calcMoonLongitude(jd) {
  const T  = (jd - 2451545.0) / 36525;  // 율리우스 세기
  // 달의 평균 황경
  const L0 = 218.3164477 + 481267.88123421 * T;
  // 달의 평균 이각(anomaly)
  const M  = 134.9633964 + 477198.8675055 * T;
  // 태양의 평균 이각
  const Ms = 357.5291092 + 35999.0502909 * T;
  // 달의 위도 인수
  const F  = 93.2720950 + 483202.0175233 * T;
  // 달의 황도 이각
  const D  = 297.8501921 + 445267.1114034 * T;

  const toRad = x => (x * Math.PI) / 180;

  // 주요 섭동 보정 (상위 10개 항)
  const corrections =
    6.288774 * Math.sin(toRad(M))
    + 1.274027 * Math.sin(toRad(2*D - M))
    + 0.658314 * Math.sin(toRad(2*D))
    + 0.213618 * Math.sin(toRad(2*M))
    - 0.185116 * Math.sin(toRad(Ms))
    - 0.114332 * Math.sin(toRad(2*F))
    + 0.058793 * Math.sin(toRad(2*D - 2*M))
    + 0.057066 * Math.sin(toRad(2*D - Ms - M))
    + 0.053322 * Math.sin(toRad(2*D + M))
    + 0.045758 * Math.sin(toRad(2*D - Ms));

  return ((L0 + corrections) % 360 + 360) % 360;
}

/**
 * 상승궁(Ascendant) 계산
 * @param {number} jd   - 율리우스 적일
 * @param {number} lat  - 위도 (도)
 * @param {number} lon  - 경도 (도, 동경 +)
 */
function calcAscendant(jd, lat, lon) {
  const toRad = x => (x * Math.PI) / 180;
  const toDeg = x => (x * 180) / Math.PI;

  // 그리니치 항성시(GMST) 계산
  const T    = (jd - 2451545.0) / 36525;
  let gmst   = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
             + 0.000387933 * T * T;
  gmst = ((gmst % 360) + 360) % 360;

  // 지방 항성시(LST)
  const lst  = ((gmst + lon) % 360 + 360) % 360;

  // 황도 경사각 (ε)
  const eps  = 23.439291111 - 0.013004167 * T;
  const epsR = toRad(eps);
  const latR = toRad(lat);
  const lstR = toRad(lst);

  // 상승점 계산
  const ascRad = Math.atan2(
    Math.cos(lstR),
    -(Math.sin(lstR) * Math.cos(epsR) + Math.tan(latR) * Math.sin(epsR))
  );
  let asc = toDeg(ascRad);
  asc = ((asc % 360) + 360) % 360;
  return asc;
}

/**
 * 황경 → 별자리 이름 변환
 */
function longitudeToSign(lon) {
  const SIGNS_KO = [
    '양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
    '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'
  ];
  const idx = Math.floor(((lon % 360) + 360) % 360 / 30);
  return SIGNS_KO[idx];
}

/**
 * 황경 → 별자리 기호
 */
function longitudeToDegreeInSign(lon) {
  return Math.round(((lon % 30) + 30) % 30 * 10) / 10;
}

/**
 * 생년월일로 출생 차트 자동 계산
 * @param {object} birth - { year, month, day, hour(0-23), minute(0-59), lat, lon, tzOffset }
 */
function calcBirthChart(birth) {
  const {
    year, month, day,
    hour    = 12,   // 시간 모를 때 정오 기준
    minute  = 0,
    lat     = 37.5665,  // 기본: 서울
    lon     = 126.9780,
    tzOffset = 9        // 한국 UTC+9
  } = birth;

  // UTC 시간으로 변환
  const hourUTC = hour - tzOffset + minute / 60;
  const jd = toJulianDay(year, month, day, hourUTC);

  const sunLon  = calcSunLongitude(jd);
  const moonLon = calcMoonLongitude(jd);
  const ascLon  = calcAscendant(jd, lat, lon);

  return {
    sun: {
      sign:   longitudeToSign(sunLon),
      degree: longitudeToDegreeInSign(sunLon),
      lon:    Math.round(sunLon * 100) / 100
    },
    moon: {
      sign:   longitudeToSign(moonLon),
      degree: longitudeToDegreeInSign(moonLon),
      lon:    Math.round(moonLon * 100) / 100
    },
    rising: {
      sign:   longitudeToSign(ascLon),
      degree: longitudeToDegreeInSign(ascLon),
      lon:    Math.round(ascLon * 100) / 100
    },
    jd: Math.round(jd * 100) / 100
  };
}

// ──────────────────────────────────────────
//  별자리 상세 데이터
// ──────────────────────────────────────────
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

// ──────────────────────────────────────────
//  Claude API 호출
// ──────────────────────────────────────────
function callClaudeAPI(apiKey, systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
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

  return new Promise((resolve, reject) => {
    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Claude API ${response.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content[0].text.trim());
        } catch(e) {
          reject(new Error('JSON 파싱 오류: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ──────────────────────────────────────────
//  메인 핸들러
// ──────────────────────────────────────────
module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { birth, concern } = req.body || {};

  // ── 모드 1: 생년월일 자동 계산
  if (birth) {
    const { year, month, day, hour, minute, lat, lon, tzOffset, timeUnknown } = birth;

    if (!year || !month || !day) {
      return res.status(400).json({ error: '생년월일(year, month, day)을 입력해주세요.' });
    }

    // 시간 모를 때 처리
    const birthData = {
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
      hour:    timeUnknown ? 12 : (parseInt(hour) || 12),
      minute:  parseInt(minute) || 0,
      lat:     parseFloat(lat)  || 37.5665,
      lon:     parseFloat(lon)  || 126.9780,
      tzOffset: parseFloat(tzOffset) || 9
    };

    // 천문 계산 실행
    const chart = calcBirthChart(birthData);
    const sun    = chart.sun.sign;
    const moon   = chart.moon.sign;
    const rising = timeUnknown ? null : chart.rising.sign;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // API 키 없어도 계산 결과는 반환
      return res.status(200).json({
        chart,
        sun, moon, rising,
        message: 'ANTHROPIC_API_KEY 없음 — 차트 계산만 반환',
        fortune: null
      });
    }

    const sunD    = SIGNS[sun]    || {};
    const moonD   = SIGNS[moon]   || {};
    const risingD = rising ? (SIGNS[rising] || {}) : null;

    const systemPrompt = `당신은 서양 점성술 전문가입니다. Swiss Ephemeris로 계산된 정확한 출생 차트를 바탕으로 운세를 분석합니다. 반드시 아래 JSON 형식으로만 답변하세요. 마크다운 없이 순수 JSON만 출력하세요.

출력 형식:
{"path_analysis":"별자리 관계 분석 200자","deep_reading":"심층 운세 해석 300자","action_guide":"1. 첫번째 행동\\n2. 두번째 행동\\n3. 세번째 행동","birth_insight":"출생 차트 특이사항 150자"}`;

    const risingText = risingD
      ? `\n상승궁(${rising}): ${risingD.element}·${risingD.quality}, ${risingD.ruler} 지배, ${(risingD.keywords||[]).join('·')} [${chart.rising.degree}°]`
      : '\n상승궁: 출생 시간 미입력 (계산 생략)';

    const userPrompt = `생년월일 ${year}년 ${month}월 ${day}일${timeUnknown ? '' : ` ${birthData.hour}시`} 출생 차트 분석:

태양궁(${sun}): ${sunD.element}·${sunD.quality}, ${sunD.ruler} 지배, ${(sunD.keywords||[]).join('·')} [${chart.sun.degree}°]
달궁(${moon}): ${moonD.element}·${moonD.quality}, ${moonD.ruler} 지배, ${(moonD.keywords||[]).join('·')} [${chart.moon.degree}°]${risingText}
${concern ? `\n사용자 고민: "${concern}"` : ''}

GraphRAG 방식으로 세 별자리의 에너지 관계망을 분석하고 운명의 흐름을 해석하세요.`;

    try {
      const raw   = await callClaudeAPI(apiKey, systemPrompt, userPrompt);
      const match = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
      const jsonStr = match ? match[1].trim() : raw;
      const result  = JSON.parse(jsonStr);

      return res.status(200).json({
        ...result,
        chart,   // 계산된 차트 데이터도 함께 반환
        sun, moon, rising,
        birth_date: `${year}.${month}.${day}${timeUnknown ? '' : ` ${birthData.hour}:${String(birthData.minute).padStart(2,'0')}`}`
      });
    } catch (err) {
      console.error('v2 오류:', err.message);
      return res.status(500).json({
        error: '운세 분석 오류: ' + err.message,
        chart, sun, moon, rising   // 계산 결과는 반환
      });
    }
  }

  // ── 모드 2: 기존 방식 (수동 별자리 선택) 호환
  const { sun, moon, rising, concern: concernDirect } = req.body || {};
  if (sun && moon) {
    // fortune.js와 동일한 로직으로 처리
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 없음' });

    const sunD    = SIGNS[sun]    || {};
    const moonD   = SIGNS[moon]   || {};
    const risingD = rising ? (SIGNS[rising] || null) : null;

    const systemPrompt = `당신은 서양 점성술 전문가입니다. 반드시 아래 JSON 형식으로만 답변하세요. 마크다운 없이 순수 JSON만 출력하세요.
출력 형식:
{"path_analysis":"분석 200자","deep_reading":"해석 300자","action_guide":"1. 행동1\\n2. 행동2\\n3. 행동3","shop_message":"개운 메시지 60자"}`;

    const risingText = risingD
      ? `\n상승궁(${rising}): ${risingD.element}·${risingD.quality}, ${risingD.ruler} 지배, ${(risingD.keywords||[]).join('·')}`
      : '';
    const concernText = concernDirect ? `\n사용자 고민: "${concernDirect}"` : '';

    const userPrompt = `GraphRAG 방식으로 세 별자리의 관계망을 분석하세요.
태양궁(${sun}): ${sunD.element}·${sunD.quality}, ${sunD.ruler} 지배, ${(sunD.keywords||[]).join('·')}
달궁(${moon}): ${moonD.element}·${moonD.quality}, ${moonD.ruler} 지배, ${(moonD.keywords||[]).join('·')}${risingText}${concernText}`;

    try {
      const raw    = await callClaudeAPI(apiKey, systemPrompt, userPrompt);
      const match  = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
      const result = JSON.parse(match ? match[1].trim() : raw);
      return res.status(200).json(result);
    } catch(err) {
      return res.status(500).json({ error: '오류: ' + err.message });
    }
  }

  return res.status(400).json({
    error: '요청 형식 오류',
    usage: {
      자동계산: { birth: { year:1990, month:3, day:15, hour:14, minute:30, lat:37.5665, lon:126.978, tzOffset:9 }, concern:'올해 연애운' },
      수동선택: { sun:'양자리', moon:'사수자리', rising:'천칭자리', concern:'직장운' }
    }
  });
};
