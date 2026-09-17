// Course rules copied from the KUSU server (services/collab/src/v2c-mindreader.mjs).
// Grading, hints, timing and scoring are unchanged; progress is kept in this browser's localStorage
// instead of a database, so there is no login, class leaderboard or teacher review here.
import {STEPS, HEART, problems, hintLimit} from './content.js';

const VERSION = 'mindreader-1';
const STORE_KEY = 'mindreader-karl-web:v1';
// A gap between two actions longer than this (student away) counts only this much.
export const SEGMENT_CAP_MS = 5 * 60 * 1000;
const fail = code => {throw Object.assign(new Error(code), {code});};
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() :
    [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''));
const bounded = (v, n = 500) => typeof v === 'string' && v.length <= n && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(v);
const actionTypes = new Set(['text','opt','conv','build','trick','pixel','wave']);
// Multiple choice and practice are timed; the trick, observation activities and story pages are not.
export const timed = s => ['opt','text','conv','build'].includes(s.t);
const activityTypes = ['trick','pixel','wave'];
const concept = STEPS.filter(s => ['text','opt','conv'].includes(s.t));
const builds = STEPS.filter(s => s.t === 'build');
if (concept.length !== 18 || builds.length !== 5) throw new Error('COURSE_RUBRIC_MISMATCH');
const FIRST_TIMED = STEPS.findIndex(timed);
const blank = () => ({version:VERSION,attemptId:newId(),attempt:1,step:0,maxStep:0,q:{},completed:false});
const qFor = (r, s) => r.q[s.id] ||= {submissions:0,wrongSubmissions:0,hints:0,ok:false,skipped:false};
const allowedValue = (s, v, r) => {
    if (['text','conv'].includes(s.t)) return bounded(v, 160);
    if (s.t === 'opt') return Number.isInteger(v) && v >= 0 && v < s.opts.length;
    if (s.t === 'build') return typeof v === 'string' && v.length === problems(r.attemptId)[s.id].n && /^[01]+$/.test(v);
    if (s.t === 'pixel') return typeof v === 'string' && /^[01]{64}$/.test(v);
    if (s.t === 'wave') return Number.isInteger(v) && v >= 3 && v <= 64;
    if (s.t === 'trick') return Array.isArray(v) && v.length <= 5 && v.every(x => typeof x === 'boolean');
    return false;
};
const correct = (s, v, q, r) => {
    const p = problems(r.attemptId)[s.id];
    if (s.t === 'opt') return v === s.right;
    if (s.t === 'conv') return /^\d+$/.test(v.trim()) && Number(v) === p.value;
    if (s.t === 'build') return v === p.bits;
    if (s.t === 'pixel') return v === HEART.join('');
    if (s.t === 'wave') return !!(q.low && q.high);
    if (s.t === 'trick') return v.length === 5;
    // Accept commas, spaces or the Chinese separators; a run-on 124816 counts too, so formatting alone is never wrong.
    if (s.id === 'q1') return ['1,2,4,8,16', '0,1,2,4,8,16'].includes(v.trim().split(/[\s,，、;；]+/u).join(',')) || /^0?124816$/u.test(v.replace(/\s+/gu, ''));
    if (s.id === 'd2') return v.replace(/\s/g,'') === p.bits;
    if (s.id === 'd3') return v.trim() === p.word;
    return s.chk(v);
};
// Add the time spent on the current timed question since the previous action.
const tick = (r, time) => {
    const s = STEPS[r.step];
    if (Number.isSafeInteger(r.sinceMs) && timed(s)) {
        const q = qFor(r, s);
        if (!q.ok) q.activeMs = (q.activeMs || 0) + Math.min(Math.max(0, time - r.sinceMs), SEGMENT_CAP_MS);
    }
    r.sinceMs = time;
};
export const courseScore = r => {
    const count = list => list.filter(s => r.q[s.id]?.ok).length;
    const concepts = count(concept), binary = count(builds);
    const activitiesDone = count(STEPS.filter(s => activityTypes.includes(s.t)));
    const done = STEPS.filter((s,k) => actionTypes.has(s.t) ? r.q[s.id]?.ok : k < r.maxStep || (r.completed && k === STEPS.length-1)).length;
    const values = Object.values(r.q);
    // A completed item loses 1 point only when every hint for it was opened.
    const hintPenalty = [...concept, ...builds].filter(s => r.q[s.id]?.ok && hintLimit(s) > 0 && r.q[s.id].hints >= hintLimit(s)).length;
    const timeMs = STEPS.filter(timed).reduce((n, s) => n + (r.q[s.id]?.activeMs || 0), 0);
    return {score:Math.max(0,Math.round((70*concepts/18+3*binary+5*activitiesDone-hintPenalty)*10)/10),
        concepts,binary,activities:activitiesDone,hintPenalty,timeMs,done,totalSteps:STEPS.length,
        progress:Math.round(done/STEPS.length*100),reached:r.maxStep+1,
        corrected:values.filter(q=>q.ok && q.wrongSubmissions>0).length,
        submissions:values.reduce((n,q)=>n+q.submissions,0),hints:values.reduce((n,q)=>n+q.hints,0),
        skipped:values.filter(q=>q.skipped&&!q.ok).length,completed:r.completed};
};
// The first completed attempt is kept as the score; the best one (score, then less time) is kept too.
const better = (a, b) => !b || a.score > b.score || (a.score === b.score && a.timeMs < b.timeMs);
const feedback = r => {
    const m=courseScore(r), pending=STEPS.find(s=>actionTypes.has(s.t)&&!r.q[s.id]?.ok);
    return {strength:`你已完成 ${m.concepts}／18 題概念與數值題、${m.binary}／5 題位元組合及 ${m.activities}／3 項操作活動。`,
        advice:pending?`下一步：回到「${pending.h||'五張卡讀心'}」，對照題目和提示再試一次。`:'所有評量項目已完成。可以向同學說明你如何利用位置值換算。',
        comment:(m.corrected?`有 ${m.corrected} 題在錯誤提交後訂正完成；訂正不扣分。`:'此分數呈現活動完成成果，不以操作次數或停留時間推論學習態度。')+(m.hintPenalty?`有 ${m.hintPenalty} 題把提示全部用完，各扣 1 分。`:'')};
};

// localStorage can be missing or blocked (private windows, strict settings); fall back to this page only.
let memory = null;
const load = () => {
    let saved = null;
    try {
        const value = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (value && Number.isSafeInteger(value.revision) && value.state?.version === VERSION) saved = {...value, persisted: true};
    } catch {
        // Unreadable storage behaves like a first visit.
    }
    return memory && (!saved || memory.revision > saved.revision) ? memory : saved;
};
const save = row => {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({revision: row.revision, updatedMs: row.updatedMs, state: row.state}));
        memory = null;
        return {...row, persisted: true};
    } catch {
        memory = {...row, persisted: false};
        return memory;
    }
};
const view = row => {
    const state=row.state, metrics=courseScore(state);
    return {revision:row.revision,updatedMs:row.updatedMs,persisted:row.persisted,segmentCapMs:SEGMENT_CAP_MS,state,metrics,
        feedback:feedback(state),first:state.first||null,best:state.best||null,finalScore:state.first?state.first.score:metrics.score};
};

export const mine = () => {
    const row = load();
    return row ? view(row) : {revision:0,updatedMs:null,persisted:true,segmentCapMs:SEGMENT_CAP_MS,state:null,metrics:null,feedback:null,first:null,best:null,finalScore:null};
};

export const reset = () => {
    memory = null;
    try {
        localStorage.removeItem(STORE_KEY);
    } catch {
        // Nothing stored.
    }
};

export const event = body => {
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !Number.isInteger(body.step) || body.step < 0 ||
        body.step >= STEPS.length || !['start','draft','submit','hint','skip','next','navigate','finish','retry'].includes(body.kind)) {
        fail('COURSE_INPUT_INVALID');
    }
    const row = load();
    // Another tab may have moved on; never overwrite its progress.
    if ((row?.revision || 0) !== body.revision) fail('COURSE_REVISION_CONFLICT');
    if (!row && body.kind !== 'start') fail('COURSE_NOT_STARTED');
    const r = row ? JSON.parse(JSON.stringify(row.state)) : blank(), time = Date.now();
    if (body.kind === 'start') {
        if (row || body.step !== 0 || body.value !== null) fail('COURSE_INPUT_INVALID');
        r.sinceMs = time;
    } else if (body.kind === 'navigate') {
        if (body.step > r.maxStep || body.value !== null) fail('COURSE_STEP_LOCKED');
        tick(r, time);
        r.step = body.step;
    } else if (body.kind === 'retry') {
        // Practice again with new numbers and option order; untimed activities already done carry over.
        if (!r.completed || body.step !== r.step || body.value !== null) fail('COURSE_STEP_LOCKED');
        const carried = Object.fromEntries(STEPS.filter(s => activityTypes.includes(s.t) && r.q[s.id]?.ok).map(s => [s.id, r.q[s.id]]));
        const next = {...blank(), attempt:(r.attempt||1)+1, retry:true, first:r.first, best:r.best, q:carried,
            step:FIRST_TIMED, maxStep:STEPS.length-1, sinceMs:time};
        Object.keys(r).forEach(k => delete r[k]);
        Object.assign(r, next);
    } else {
        if (body.step !== r.step) fail('COURSE_STEP_CONFLICT');
        tick(r, time);
        const s = STEPS[r.step], q = actionTypes.has(s.t) ? qFor(r, s) : null;
        if (['draft','submit'].includes(body.kind)) {
            if (!q || !allowedValue(s, body.value, r)) fail('COURSE_INPUT_INVALID');
            if (!q.ok) {
                q.answer = body.value;
                if (s.t === 'wave') {if (body.value <= 5) q.low = true;if (body.value >= 60) q.high = true;}
                if (body.kind === 'submit') {
                    q.submissions++;
                    const ok = correct(s, body.value, q, r);
                    if (q.submissions === 1) q.firstCorrect = ok;
                    if (!ok) q.wrongSubmissions++;
                    q.ok = ok;
                    if (ok) {q.skipped = false;q.solvedMs = time;}
                }
            }
        } else {
            if (body.value !== null) fail('COURSE_INPUT_INVALID');
            if (body.kind === 'hint') {
                if (!q) fail('COURSE_INPUT_INVALID');
                if (!q.ok) q.hints = Math.min(q.hints + 1, hintLimit(s));
            } else if (body.kind === 'skip') {
                if (!s.skip || !q) fail('COURSE_INPUT_INVALID');
                if (!q.ok) q.skipped = true;
                r.step = Math.min(r.step + 1, STEPS.length - 1);
            } else if (body.kind === 'next') {
                if (q && !q.ok && !q.skipped) fail('COURSE_STEP_LOCKED');
                if (r.step === STEPS.length - 1) fail('COURSE_INPUT_INVALID');
                // In a retry, jump straight to the next timed question (or the final page).
                if (r.retry) {let k = r.step + 1;while (k < STEPS.length - 1 && !timed(STEPS[k])) k++;r.step = k;} else r.step++;
            } else if (body.kind === 'finish') {
                if (r.step !== STEPS.length - 1) fail('COURSE_STEP_LOCKED');
                if (!r.completed) {
                    r.completed = true;
                    const m = courseScore(r), entry = {attempt:r.attempt||1, score:m.score, timeMs:m.timeMs, completedMs:time};
                    if (!r.first) r.first = entry;
                    if (better(entry, r.best)) r.best = entry;
                }
            }
        }
        r.maxStep = Math.max(r.maxStep, r.step);
    }
    return view(save({revision: body.revision + 1, updatedMs: time, state: r}));
};
