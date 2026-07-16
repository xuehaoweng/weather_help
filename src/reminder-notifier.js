import { evaluateReminder } from "./reminder-engine.js";

export function checkAndNotify({
  config,
  insight,
  location,
  weatherText,
  now = new Date(),
  NotificationImpl = globalThis.Notification
} = {}) {
  const evaluation = evaluateReminder({
    config,
    firstRainAt: insight?.firstRainAt,
    now,
    location,
    weatherText
  });
  if (!evaluation.shouldNotify) return { ...evaluation, sent: false, inPage: false };

  if (NotificationImpl?.permission === "granted") {
    new NotificationImpl(evaluation.title, {
      body: evaluation.body,
      tag: evaluation.notificationKey,
      icon: "/favicon.svg"
    });
    return { ...evaluation, sent: true, inPage: false };
  }

  return {
    ...evaluation,
    sent: false,
    inPage: true,
    message: `${evaluation.title}：${evaluation.body}`
  };
}
