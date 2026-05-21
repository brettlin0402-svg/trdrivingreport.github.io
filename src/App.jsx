import { useEffect, useMemo, useState } from 'react';
import { CornerUpLeft, RotateCcw, TrainFront, Check, X } from 'lucide-react';

const APP_VERSION = '8964.0.0';
const SPLASH_MS = 1200;

const MODES = {
  before: {
    label: '開車前整備',
    pageColor: '#DDDDDD',
    action: '減',
    customSign: -1,
  },
  after: {
    label: '到達後整備',
    pageColor: '#CCFFCC',
    action: '加',
    customSign: 1,
  },
};

const RULES = {
  before: [
    { id: 'e1000', label: 'E1000 推拉式', minutes: 90 },
    { id: 'r200', label: 'E&R型機車', sequence: [60, 20] },
    { id: 'emu900', label: 'EMU900', minutes: 70 },
    { id: 'emu3000', label: 'EMU3000', minutes: 80 },
    { id: 'emu700', label: '電聯車組', sequence: [60, 20] },
    { id: 'dr3100', label: 'DR3100', sequence: [60, 20] },
    { id: 'dr1000', label: 'DR1000', sequence: [60, 20], maxTotal: 120 },
    { id: 'ride', label: '便乘', minutes: 40, maxCount: 1 },
    { id: 'station', label: '站接', minutes: 50, maxCount: 1 },
    { id: 'custom', label: '輸入', custom: true },
  ],
  after: [
    { id: 'e1000', label: 'E1000 推拉式', minutes: 50 },
    { id: 'r200', label: 'E&R型機車', sequence: [40, 10] },
    { id: 'emu900', label: 'EMU900', minutes: 50 },
    { id: 'emu3000', label: 'EMU3000', minutes: 50 },
    { id: 'emu700', label: '電聯車組', sequence: [40, 10] },
    { id: 'dr3100', label: 'DR3100', sequence: [40, 10] },
    { id: 'dr1000', label: 'DR1000', sequence: [40, 10] },
    { id: 'ride', label: '便乘', minutes: 20, maxCount: 1 },
    { id: 'station', label: '站交', minutes: 30, maxCount: 1 },
    { id: 'custom', label: '輸入', custom: true },
  ],
};

function getCurrentMinuteDate() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function applyDatePart(date, part, value) {
  const next = new Date(date);
  if (part === 'month') {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(value - 1);
    next.setDate(Math.min(day, daysInMonth(next.getFullYear(), value)));
  }
  if (part === 'day') next.setDate(value);
  if (part === 'hour') next.setHours(value);
  if (part === 'minute') next.setMinutes(value);
  next.setSeconds(0, 0);
  return next;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getRuleMinutes(rule, existingEntries) {
  const sameRuleEntries = existingEntries.filter((entry) => entry.ruleId === rule.id);
  if (rule.maxCount && sameRuleEntries.length >= rule.maxCount) return null;

  if (rule.sequence) {
    const nextMinutes = rule.sequence[Math.min(sameRuleEntries.length, rule.sequence.length - 1)];
    const usedMinutes = sameRuleEntries.reduce((sum, entry) => sum + entry.rawMinutes, 0);
    if (rule.maxTotal && usedMinutes + nextMinutes > rule.maxTotal) return null;
    return nextMinutes;
  }

  return rule.minutes;
}

function formatTwo(value) {
  return String(value).padStart(2, '0');
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showReminder, setShowReminder] = useState(() => localStorage.getItem('traReminderAccepted') !== APP_VERSION);
  const [mode, setMode] = useState('before');
  const [baseTime, setBaseTime] = useState(getCurrentMinuteDate);
  const [entries, setEntries] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.style.background = MODES[mode].pageColor;
  }, [mode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const resultTime = useMemo(() => {
    return entries.reduce((time, entry) => addMinutes(time, entry.signedMinutes), baseTime);
  }, [baseTime, entries]);

  const rules = RULES[mode];
  const modeConfig = MODES[mode];

  function confirmReminder() {
    localStorage.setItem('traReminderAccepted', APP_VERSION);
    setShowReminder(false);
  }

  function changeMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setBaseTime(getCurrentMinuteDate());
    setEntries([]);
    setNotice('');
  }

  function adjustPart(part, direction) {
    setBaseTime(() => {
      const year = resultTime.getFullYear();
      const maxDay = daysInMonth(year, resultTime.getMonth() + 1);
      const currentValue = {
        month: resultTime.getMonth() + 1,
        day: resultTime.getDate(),
        hour: resultTime.getHours(),
        minute: resultTime.getMinutes(),
      }[part];
      const ranges = {
        month: [1, 12],
        day: [1, maxDay],
        hour: [0, 23],
        minute: [0, 59],
      };
      const [min, max] = ranges[part];
      const span = max - min + 1;
      const nextValue = ((currentValue - min + direction + span) % span) + min;
      return applyDatePart(resultTime, part, nextValue);
    });
    setEntries([]);
  }

  function applyRule(rule) {
    if (rule.custom) {
      setCustomMinutes('');
      setCustomOpen(true);
      return;
    }

    const rawMinutes = getRuleMinutes(rule, entries);
    if (rawMinutes === null) {
      setNotice(`${rule.label} 已達上限`);
      return;
    }

    const signedMinutes = modeConfig.customSign * rawMinutes;
    setEntries((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ruleId: rule.id,
        label: rule.label,
        rawMinutes,
        signedMinutes,
      },
    ]);
  }

  function confirmCustom() {
    const rawMinutes = Number.parseInt(customMinutes, 10);
    if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) {
      setNotice('請輸入大於 0 的分鐘數');
      return;
    }

    setEntries((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ruleId: 'custom',
        label: `輸入 ${rawMinutes}`,
        rawMinutes,
        signedMinutes: modeConfig.customSign * rawMinutes,
      },
    ]);
    setCustomOpen(false);
  }

  function undoLast() {
    setEntries((current) => current.slice(0, -1));
  }

  function resetAll() {
    setBaseTime(getCurrentMinuteDate());
    setEntries([]);
    setNotice('');
  }

  const dateParts = [
    { key: 'month', label: '月', value: resultTime.getMonth() + 1 },
    { key: 'day', label: '日', value: resultTime.getDate() },
    { key: 'hour', label: '時', value: resultTime.getHours() },
    { key: 'minute', label: '分', value: resultTime.getMinutes() },
  ];

  if (showSplash) {
    return (
      <main className="splash" aria-label="啟動畫面">
        <div className="logoMark">
          <TrainFront size={52} strokeWidth={2.2} />
        </div>
        <h1>台鐵司機員<br />報單時間計算機</h1>
        <p>TRA Duty Time</p>
      </main>
    );
  }

  return (
    <main className="appShell">
      <section className="calculator" aria-label="台鐵司機員報單時間計算機">
        <div className="modeTabs" role="tablist" aria-label="模式">
          {Object.entries(MODES).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className={key === mode ? 'active' : ''}
              style={{ '--mode-color': item.pageColor }}
              onClick={() => changeMode(key)}
              role="tab"
              aria-selected={key === mode}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="timePanel">
          {dateParts.map((part) => (
            <div className="timePart" key={part.key}>
              <button type="button" aria-label={`${part.label}增加`} onClick={() => adjustPart(part.key, 1)}>+</button>
              <strong>{formatTwo(part.value)}</strong>
              <span>{part.label}</span>
              <button type="button" aria-label={`${part.label}減少`} onClick={() => adjustPart(part.key, -1)}>-</button>
            </div>
          ))}
        </div>

        <div className="selectedStrip" aria-label="已點選項目">
          {entries.length === 0 ? (
            <span className="emptyText">尚未點選項目</span>
          ) : (
            entries.map((entry) => <span key={entry.id}>{entry.label}</span>)
          )}
        </div>

        <div className="quickActions">
          <button type="button" onClick={undoLast} disabled={entries.length === 0}>
            <CornerUpLeft size={21} />
            退回
          </button>
          <button type="button" onClick={resetAll}>
            <RotateCcw size={21} />
            歸零
          </button>
        </div>

        <div className="ruleGrid">
          {rules.map((rule) => (
            <button key={rule.id} type="button" onClick={() => applyRule(rule)}>
              <span>{rule.label}</span>
              <small>{rule.custom ? '自訂分鐘' : `${modeConfig.action} ${describeRule(rule)} 分`}</small>
            </button>
          ))}
        </div>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}

      {showReminder && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
          <div className="modal">
            <h2 id="reminder-title">提醒</h2>
            <p>1.本APP之計算結果僅供參考，實際仍以臺鐵公司之最新規定與公告為準。</p>
            <p>2.本APP為作者基於個人興趣自行開發，未接受任何機構或企業之資助或合作。</p>
            <p>3.本APP之著作權及相關智慧財產權均歸作者所有，未經授權不得擅自重製、散布或作為商業用途。</p>
            <p>4.沒有100分的軟體，但我用100分的努力製作，製作不易。</p>
            <p>5.版本{APP_VERSION}</p>
            <button type="button" className="primaryButton" onClick={confirmReminder}>
              <Check size={20} />
              確認
            </button>
          </div>
        </div>
      )}

      {customOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="custom-title">
          <div className="modal compact">
            <h2 id="custom-title">輸入分鐘數</h2>
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value.replace(/\D/g, ''))}
              placeholder="請輸入分鐘"
            />
            <div className="modalActions">
              <button type="button" onClick={() => setCustomOpen(false)}>
                <X size={20} />
                取消
              </button>
              <button type="button" className="primaryButton" onClick={confirmCustom}>
                <Check size={20} />
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function describeRule(rule) {
  if (rule.sequence) {
    return `${rule.sequence[0]} / ${rule.sequence[1]}`;
  }
  return rule.minutes;
}

export default App;
