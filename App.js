import React, { useEffect, useState } from "react";
import "./App.css";
import Login from "./components/Login";
import BudgetSetup from "./components/BudgetSetup";
import MonthExpenseEntry from "./components/MonthExpenseEntry";
import ExpenseTracker from "./components/ExpenseTracker";
import QuestionFeature from "./components/QuestionFeature";
import {
  getSession,
  clearSession,
  getAllMonthData,
  saveAllMonthData,
  getMonthKey,
  getMonthLabel,
  getQuestions,
  saveQuestions,
} from "./utils/storage";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function App() {
  const [username, setUsername] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "help"
  const [monthData, setMonthData] = useState({});
  const [questions, setQuestions] = useState([]);
  // "budget" -> ask this month's budget
  // "entry"  -> batch-log this month's expenses, then confirm + review
  // "dashboard" -> normal app (Dashboard / Ask & help tabs)
  const [stage, setStage] = useState("dashboard");

  const monthKey = getMonthKey();
  const monthLabel = getMonthLabel(monthKey);
  const currentMonth = monthData[monthKey] || {
    budget: null,
    expenses: [],
    finalized: false,
  };

  // Restore session on first load
  useEffect(() => {
    const session = getSession();
    if (session) {
      setUsername(session.username);
    }
  }, []);

  // Load this user's data whenever they log in, and figure out which
  // stage of the flow they should land on for the current month.
  useEffect(() => {
    if (username) {
      const data = getAllMonthData(username);
      setMonthData(data);
      setQuestions(getQuestions(username));

      const cm = data[monthKey];
      if (!cm || cm.budget == null) {
        setStage("budget");
      } else if (!cm.finalized) {
        setStage("entry");
      } else {
        setStage("dashboard");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function persistMonthData(next) {
    setMonthData(next);
    saveAllMonthData(username, next);
  }

  function handleLogin(loggedInUsername) {
    setUsername(loggedInUsername);
    setActiveTab("dashboard");
  }

  function handleLogout() {
    clearSession();
    setUsername(null);
    setMonthData({});
    setQuestions([]);
    setStage("dashboard");
  }

  // ---- Step 1: budget ----
  function handleSetBudget(budget) {
    const existing = monthData[monthKey] || { expenses: [], finalized: false };
    const next = {
      ...monthData,
      [monthKey]: { ...existing, budget },
    };
    persistMonthData(next);
    setStage("entry");
  }

  // ---- Step 2: batch expense entry ----
  function handleAddExpenseDuringEntry(expense) {
    const cm = monthData[monthKey];
    const next = {
      ...monthData,
      [monthKey]: { ...cm, expenses: [expense, ...cm.expenses] },
    };
    persistMonthData(next);
  }

  function handleDeleteExpenseDuringEntry(id) {
    const cm = monthData[monthKey];
    const next = {
      ...monthData,
      [monthKey]: { ...cm, expenses: cm.expenses.filter((e) => e.id !== id) },
    };
    persistMonthData(next);
  }

  function handleFinalizeMonth() {
    const cm = monthData[monthKey];
    const next = {
      ...monthData,
      [monthKey]: { ...cm, finalized: true },
    };
    persistMonthData(next);
    setStage("dashboard");
  }

  // ---- Dashboard-level edits (after the month is finalized) ----
  function handleDashboardExpensesChange(nextExpenses) {
    const cm = monthData[monthKey];
    const next = {
      ...monthData,
      [monthKey]: { ...cm, expenses: nextExpenses },
    };
    persistMonthData(next);
  }

  function handleEditBudget(newBudget) {
    const cm = monthData[monthKey];
    const next = {
      ...monthData,
      [monthKey]: { ...cm, budget: newBudget },
    };
    persistMonthData(next);
  }

  function handleQuestionsChange(nextQuestions) {
    setQuestions(nextQuestions);
    saveQuestions(username, nextQuestions);
  }

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  if (stage === "budget") {
    return (
      <BudgetSetup
        monthLabel={monthLabel}
        username={username}
        onSubmit={handleSetBudget}
      />
    );
  }

  if (stage === "entry") {
    return (
      <MonthExpenseEntry
        monthLabel={monthLabel}
        budget={currentMonth.budget}
        expenses={currentMonth.expenses}
        onAddExpense={handleAddExpenseDuringEntry}
        onDeleteExpense={handleDeleteExpenseDuringEntry}
        onFinalize={handleFinalizeMonth}
      />
    );
  }

  // stage === "dashboard"
  const total = currentMonth.expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = currentMonth.budget - total;
  const progress =
    currentMonth.budget > 0
      ? Math.min((total / currentMonth.budget) * 100, 100)
      : 0;

  const history = Object.keys(monthData)
    .filter((k) => k !== monthKey && monthData[k].finalized)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((k) => ({
      monthKey: k,
      label: getMonthLabel(k),
      budget: monthData[k].budget,
      total: monthData[k].expenses.reduce((sum, e) => sum + e.amount, 0),
    }));

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">§</span>
          <span className="app-brand-name">Ledger</span>
        </div>

        <nav className="app-nav">
          <button
            type="button"
            className={
              activeTab === "dashboard" ? "app-nav-item is-active" : "app-nav-item"
            }
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={
              activeTab === "help" ? "app-nav-item is-active" : "app-nav-item"
            }
            onClick={() => setActiveTab("help")}
          >
            Ask &amp; help
          </button>
        </nav>

        {/* Persistent remaining-money summary — visible on every tab */}
        <div className="sidebar-budget-widget">
          <p className="sidebar-widget-label">{monthLabel}</p>
          <p className="sidebar-widget-remaining">{formatCurrency(remaining)}</p>
          <p className="sidebar-widget-sub">
            {remaining >= 0 ? "left to spend" : "over budget"}
          </p>
          <div className="sidebar-widget-bar">
            <div
              className="sidebar-widget-fill"
              style={{
                width: `${progress}%`,
                background: remaining < 0 ? "#e74c3c" : "#2ecc71",
              }}
            />
          </div>
          <p className="sidebar-widget-sub">
            {formatCurrency(total)} of {formatCurrency(currentMonth.budget)} spent
          </p>
        </div>

        <div className="app-sidebar-footer">
          <p className="app-signed-in-as">
            Signed in as
            <br />
            <strong>{username}</strong>
          </p>
          <button type="button" className="app-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <h1 className="app-title">
            {activeTab === "dashboard" ? "Dashboard" : "Ask & help"}
          </h1>
        </header>

        {activeTab === "dashboard" ? (
          <ExpenseTracker
            monthKey={monthKey}
            monthLabel={monthLabel}
            budget={currentMonth.budget}
            expenses={currentMonth.expenses}
            history={history}
            onChange={handleDashboardExpensesChange}
            onEditBudget={handleEditBudget}
          />
        ) : (
          <QuestionFeature
            questions={questions}
            onChange={handleQuestionsChange}
          />
        )}
      </main>
    </div>
  );
}
