// RunBalance 3-week planner — plain JS (React.createElement), no JSX/Babel needed at runtime.
const h = React.createElement;
const { useState, useMemo, useEffect } = React;

const STATS_KEY = "runbalance-planner-stats";

function round1(n) { return Math.round(n * 10) / 10; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function buildPlan({ gender, age, heightCm, weightKg, sampleDistance, sampleTime }) {
  const samplePace = sampleTime / sampleDistance;
  const heightAdj = clamp((175 - heightCm) * 0.01, -0.5, 0.5);
  const basePace = clamp(samplePace + heightAdj, 3.5, 15);
  const trainingPace = basePace + 1.0;

  let ageFactor;
  if (age < 30) ageFactor = 1.1;
  else if (age < 45) ageFactor = 1.0;
  else if (age < 60) ageFactor = 0.85;
  else ageFactor = 0.7;

  const genderFactor = gender === "Female" ? 0.85 : 1.15;
  const combined = ageFactor * genderFactor;

  const week3Long = clamp(round1(sampleDistance * combined), 2, sampleDistance * 1.5);
  const week1Long = clamp(round1(Math.max(1, week3Long * 0.35)), 1, week3Long);
  const week2Long = clamp(round1(week3Long * 0.65), week1Long, week3Long);
  const longRuns = [week1Long, week2Long, week3Long];

  const weeks = [1, 2, 3].map((weekNum) => {
    const longRun = longRuns[weekNum - 1];
    const easyRun = round1(longRun * 0.6);
    const easyRun2 = round1(longRun * 0.4);
    const rawDays = [
      { day: "Mon", type: "Rest / mobility", distance: 0 },
      { day: "Tue", type: "Easy run", distance: easyRun },
      { day: "Wed", type: "Rest / cross-train", distance: 0 },
      { day: "Thu", type: "Easy run", distance: easyRun2 },
      { day: "Fri", type: "Rest", distance: 0 },
      { day: "Sat", type: "Long run", distance: longRun },
      { day: "Sun", type: "Recovery walk", distance: 0 },
    ];
    const days = rawDays.map((d) => ({
      ...d,
      duration: d.distance > 0 ? Math.round(d.distance * trainingPace) : d.type === "Recovery walk" ? 25 : 0,
      calories: d.distance > 0 ? Math.round(1.036 * weightKg * d.distance) : 0,
    }));
    const weekDistance = round1(days.reduce((s, d) => s + d.distance, 0));
    const weekCalories = days.reduce((s, d) => s + d.calories, 0);
    return { week: weekNum, longRun, days, weekDistance, weekCalories };
  });

  return { weeks, trainingPace: round1(trainingPace) };
}

function Field(label, inputEl, error) {
  return h("div", null,
    h("label", { className: "rb-label" }, label),
    inputEl,
    error ? h("p", { className: "rb-error" }, error) : null
  );
}

function RunBalancePlanner() {
  const [step, setStep] = useState("form");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("Female");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("3");
  const [sampleDistance, setSampleDistance] = useState("5");
  const [sampleTime, setSampleTime] = useState("35");
  const [dietConfirmed, setDietConfirmed] = useState(true);
  const [errors, setErrors] = useState({});
  const [activeWeek, setActiveWeek] = useState(1);
  const [totalCount, setTotalCount] = useState(null);
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const result = await window.storage.get(STATS_KEY, true);
        const data = result ? JSON.parse(result.value) : { count: 0 };
        setTotalCount(data.count || 0);
      } catch (e) { setTotalCount(0); }
    }
    if (window.storage) { loadStats(); } else { setTotalCount(0); }
  }, []);

  async function logNewPlan() {
    if (!window.storage) { setMyRank((totalCount || 0) + 1); return; }
    try {
      let current = 0;
      try {
        const result = await window.storage.get(STATS_KEY, true);
        current = result ? JSON.parse(result.value).count || 0 : 0;
      } catch (e) { current = 0; }
      const next = current + 1;
      await window.storage.set(STATS_KEY, JSON.stringify({ count: next }), true);
      setTotalCount(next);
      setMyRank(next);
    } catch (e) {}
  }

  const result = useMemo(() => {
    const w = parseFloat(weight), ht = parseFloat(height), a = parseFloat(age);
    const sd = parseFloat(sampleDistance), st = parseFloat(sampleTime);
    if (!w || w <= 0 || !ht || ht <= 0 || !a || a <= 0 || !sd || sd <= 0 || !st || st <= 0) return null;
    return buildPlan({ gender, age: a, heightCm: ht, weightKg: w, sampleDistance: sd, sampleTime: st });
  }, [gender, age, height, weight, sampleDistance, sampleTime]);

  const plan = result ? result.weeks : null;

  const totals = useMemo(() => {
    if (!plan) return null;
    const distance = round1(plan.reduce((s, w) => s + w.weekDistance, 0));
    const calories = plan.reduce((s, w) => s + w.weekCalories, 0);
    return { distance, calories };
  }, [plan]);

  const goalNum = parseFloat(goal) || 0;
  const requiredDeficit = goalNum * 7700;
  const coveragePct = totals && requiredDeficit > 0 ? Math.min(100, Math.round((totals.calories / requiredDeficit) * 100)) : 0;

  function handleSubmit() {
    const errs = {};
    if (!name.trim()) errs.name = "Add your name";
    if (!parseFloat(age) || parseFloat(age) <= 0) errs.age = "Enter your age";
    if (!parseFloat(height) || parseFloat(height) <= 0) errs.height = "Enter height in cm";
    if (!parseFloat(weight) || parseFloat(weight) <= 0) errs.weight = "Enter weight in kg";
    if (!parseFloat(goal) || parseFloat(goal) <= 0) errs.goal = "Enter a target in kg";
    if (!parseFloat(sampleDistance) || parseFloat(sampleDistance) <= 0) errs.sampleDistance = "Enter a distance";
    if (!parseFloat(sampleTime) || parseFloat(sampleTime) <= 0) errs.sampleTime = "Enter a time";
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      setStep("plan"); setActiveWeek(1); logNewPlan();
    }
  }

  // ---- FORM STEP ----
  function renderForm() {
    return h("div", null,
      h("p", { style: { fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: "11px", letterSpacing: "0.5px", color: "#4FA37A", margin: "0 0 6px" } }, "runbalance"),
      h("h1", { style: { fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: "32px", lineHeight: 1.15, margin: "0 0 10px" } },
        `Lose ${goalNum || "3"}kg in 3 weeks.`, h("br"), "Keep your diet. Just run smarter."
      ),
      h("p", { style: { color: "#9AA79E", fontSize: "14px", lineHeight: 1.6, margin: "0 0 16px", maxWidth: "480px" } },
        "Scaled to your age, height, gender and current pace — not a generic plan."
      ),
      (totalCount !== null && totalCount > 0) ? h("div", { style: { marginBottom: "24px", color: "#4FA37A", fontSize: "13px" } },
        `${totalCount.toLocaleString()} runners have already built their plan`
      ) : null,
      h("div", { style: { display: "grid", gap: "16px" } },
        Field("Your name",
          h("input", { className: "rb-input", placeholder: "Jatin", value: name, onChange: (e) => setName(e.target.value) }),
          errors.name
        ),
        h("div", null,
          h("label", { className: "rb-label" }, "Gender"),
          h("div", { style: { display: "flex", gap: "8px" } },
            ["Female", "Male"].map((g) =>
              h("button", {
                key: g, type: "button",
                className: `rb-btn-ghost ${gender === g ? "active" : ""}`,
                onClick: () => setGender(g)
              }, g)
            )
          )
        ),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" } },
          Field("Age", h("input", { className: "rb-input", type: "number", placeholder: "29", value: age, onChange: (e) => setAge(e.target.value) }), errors.age),
          Field("Height (cm)", h("input", { className: "rb-input", type: "number", placeholder: "170", value: height, onChange: (e) => setHeight(e.target.value) }), errors.height),
          Field("Weight (kg)", h("input", { className: "rb-input", type: "number", placeholder: "72", value: weight, onChange: (e) => setWeight(e.target.value) }), errors.weight)
        ),
        Field("Weight-loss goal (kg)",
          h("input", { className: "rb-input", type: "number", placeholder: "3", value: goal, onChange: (e) => setGoal(e.target.value), style: { maxWidth: "140px" } }),
          errors.goal
        ),
        h("div", null,
          h("label", { className: "rb-label" }, "A run you can comfortably do right now"),
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("input", { className: "rb-input", type: "number", value: sampleDistance, onChange: (e) => setSampleDistance(e.target.value), style: { maxWidth: "90px" } }),
            h("span", { style: { color: "#9AA79E", fontSize: "13px" } }, "km in"),
            h("input", { className: "rb-input", type: "number", value: sampleTime, onChange: (e) => setSampleTime(e.target.value), style: { maxWidth: "90px" } }),
            h("span", { style: { color: "#9AA79E", fontSize: "13px" } }, "min")
          ),
          h("p", { style: { color: "#6F7B73", fontSize: "12px", marginTop: "6px" } }, "e.g. 5 km in 35 min — your usual easy pace, not a personal best"),
          (errors.sampleDistance || errors.sampleTime) ? h("p", { className: "rb-error" }, errors.sampleDistance || errors.sampleTime) : null
        ),
        h("label", { style: { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: "#9AA79E", cursor: "pointer" } },
          h("input", { type: "checkbox", checked: dietConfirmed, onChange: (e) => setDietConfirmed(e.target.checked), style: { marginTop: "2px" } }),
          "I'm keeping my current diet unchanged — this plan is running-only"
        )
      ),
      h("button", { className: "rb-btn", style: { marginTop: "24px" }, onClick: handleSubmit }, "Build my plan \u2192"),
      h("p", { style: { color: "#6F7B73", fontSize: "11px", marginTop: "24px", lineHeight: 1.6 } },
        "Not medical advice. If you're new to running or managing a health condition, check with a doctor before starting."
      )
    );
  }

  // ---- PLAN STEP ----
  function renderPlan() {
    const week = plan[activeWeek - 1];
    return h("div", null,
      h("button", { className: "rb-btn-ghost", style: { marginBottom: "20px" }, onClick: () => setStep("form") }, "\u2190 Edit details"),
      h("p", { style: { fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: "11px", letterSpacing: "0.5px", color: "#4FA37A", margin: "0 0 6px" } }, `${name}'s plan`),
      h("h1", { style: { fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: "28px", margin: "0 0 10px" } }, `3 weeks to ${goalNum}kg lighter`),
      myRank !== null ? h("p", { style: { color: "#4FA37A", fontSize: "13px", margin: "0 0 20px" } }, `You're runner #${myRank.toLocaleString()} to build a plan here`) : null,
      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" } },
        h("div", { style: { background: "#262F2A", borderRadius: "10px", padding: "14px" } },
          h("p", { style: { fontFamily: "'Oswald',sans-serif", fontSize: "22px", fontWeight: 600, margin: "0" } }, `${totals.distance} km`),
          h("p", { style: { color: "#9AA79E", fontSize: "12px", margin: "2px 0 0" } }, "total running")
        ),
        h("div", { style: { background: "#262F2A", borderRadius: "10px", padding: "14px" } },
          h("p", { style: { fontFamily: "'Oswald',sans-serif", fontSize: "22px", fontWeight: 600, margin: "0" } }, totals.calories.toLocaleString()),
          h("p", { style: { color: "#9AA79E", fontSize: "12px", margin: "2px 0 0" } }, "kcal burned (est.)")
        ),
        h("div", { style: { background: "#262F2A", borderRadius: "10px", padding: "14px" } },
          h("p", { style: { fontFamily: "'Oswald',sans-serif", fontSize: "22px", fontWeight: 600, margin: "0" } }, `${coveragePct}%`),
          h("p", { style: { color: "#9AA79E", fontSize: "12px", margin: "2px 0 0" } }, "of goal from running alone")
        )
      ),
      coveragePct < 100 ? h("div", { style: { background: "#262F2A", borderRadius: "10px", padding: "14px 16px", marginBottom: "24px" } },
        h("p", { style: { fontSize: "13px", color: "#9AA79E", lineHeight: 1.6, margin: 0 } },
          `Losing ${goalNum}kg in 3 weeks needs roughly ${requiredDeficit.toLocaleString()} kcal of deficit. ` +
          `This plan covers about ${coveragePct}% of that through running alone. Closing the rest without ` +
          `touching your diet is an aggressive pace — a steadier, safer target is usually 0.5–1kg a week. ` +
          `Stretching the plan beyond 3 weeks is the easiest way to close the gap safely.`
        )
      ) : null,
      h("div", { style: { display: "flex", gap: "8px", marginBottom: "16px" } },
        plan.map((w) => h("button", {
          key: w.week,
          className: `rb-btn-ghost ${activeWeek === w.week ? "active" : ""}`,
          onClick: () => setActiveWeek(w.week)
        }, `Week ${w.week}`))
      ),
      h("div", { style: { display: "grid", gap: "8px" } },
        week.days.map((d) => h("div", {
          key: d.day,
          style: { background: "#262F2A", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }
        },
          h("div", null,
            h("p", { style: { margin: 0, fontSize: "13px", fontWeight: 500 } }, d.day),
            h("p", { style: { margin: 0, fontSize: "12px", color: "#9AA79E" } }, d.type)
          ),
          h("div", { style: { textAlign: "right" } },
            d.distance > 0
              ? h(React.Fragment, null,
                  h("p", { style: { margin: 0, fontFamily: "'Oswald',sans-serif", fontSize: "16px", fontWeight: 600 } }, `${d.distance} km`),
                  h("p", { style: { margin: 0, fontSize: "12px", color: "#9AA79E" } }, `~${d.duration} min \u00b7 ${d.calories} kcal`)
                )
              : d.type === "Recovery walk"
                ? h("p", { style: { margin: 0, fontSize: "12px", color: "#9AA79E" } }, `~${d.duration} min walk`)
                : h("p", { style: { margin: 0, fontSize: "12px", color: "#6F7B73" } }, "off")
          )
        ))
      ),
      h("div", { style: { marginTop: "20px", color: "#6F7B73", fontSize: "12px" } },
        `Saturday is your long run — it grows from ${plan[0].longRun}km to ${plan[2].longRun}km over the 3 weeks, at roughly ${result.trainingPace} min/km.`
      )
    );
  }

  return h("div", {
      style: { fontFamily: "'Inter', sans-serif", background: "#1D2521", color: "#F3F1EA", padding: "2.5rem 1.75rem", borderRadius: "16px", maxWidth: "680px", margin: "0 auto" }
    },
    step === "form" ? renderForm() : (plan && totals ? renderPlan() : renderForm())
  );
}

const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(h(RunBalancePlanner));
