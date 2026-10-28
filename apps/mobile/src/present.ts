import {
  isoDateToDisplay,
  messages,
  type DashboardReport,
  type Lang,
  type PublicTicket,
  type SearchHit,
} from '@kmbhelp/shared';

export function formatAge(seconds: number, lang: Lang): string {
  const copy = messages[lang];
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} ${copy.minutes}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${copy.hours}`;
  return `${Math.floor(hours / 24)} ${copy.days}`;
}

export function priorityLabel(priority: string, lang: Lang): string {
  const copy = messages[lang];
  if (priority === 'p1') return copy.priorityP1;
  if (priority === 'p2') return copy.priorityP2;
  if (priority === 'p3') return copy.priorityP3;
  return priority;
}

export function statusLabel(status: string, lang: Lang): string {
  const copy = messages[lang];
  if (status === 'open') return copy.statusOpen;
  if (status === 'in_progress') return copy.statusInProgress;
  if (status === 'waiting_approval') return copy.statusWaiting;
  if (status === 'manual') return copy.statusManual;
  if (status === 'closed') return copy.statusClosed;
  if (status === 'inactive') return copy.statusInactive;
  if (status === 'expired') return copy.statusExpired;
  return status;
}

export function presentPublicRow(
  ticket: PublicTicket,
  lang: Lang,
): { number: number; subject: string; meta: string } {
  const copy = messages[lang];
  const due = ticket.dueOn ? isoDateToDisplay(ticket.dueOn) : copy.noDue;
  return {
    number: ticket.number,
    subject: ticket.subject,
    meta: `${copy.age} ${formatAge(ticket.ageSeconds, lang)} · ${copy.dueUntil} ${due} · ${statusLabel(ticket.status, lang)} · ${priorityLabel(ticket.priority, lang)}`,
  };
}

export function presentSearchHit(hit: SearchHit, lang: Lang): { title: string; sentence: string } {
  return {
    title: lang === 'de' ? hit.titleDe : hit.titleEn,
    sentence: lang === 'de' ? hit.sentenceDe : hit.sentenceEn,
  };
}

export function presentDashboard(report: DashboardReport, lang: Lang): string[] {
  const copy = messages[lang];
  const lines = [
    `${copy.dashboardIncoming} ${report.incoming}`,
    `${copy.dashboardClosed} ${report.closed}`,
    `${copy.dashboardOpenP1} ${report.openP1}`,
    `${copy.dashboardResponse} ${report.medianFirstResponseMinutes ?? copy.dashboardNone}`,
    `${copy.dashboardResolution} ${report.medianResolutionMinutes ?? copy.dashboardNone}`,
    `${copy.dashboardEffort} ${report.effortMinutes}`,
  ];
  for (const slice of report.slices) {
    const name =
      slice.key === 'mail'
        ? copy.dashboardSliceMail
        : slice.key === 'web'
          ? copy.dashboardSliceWeb
          : slice.key === 'done'
            ? copy.dashboardSliceDone
            : slice.key === 'p1'
              ? copy.dashboardSliceP1
              : slice.key === 'p2'
                ? copy.dashboardSliceP2
                : copy.dashboardSliceP3;
    lines.push(`${name} ${slice.count} (${slice.percent} %)`);
  }
  for (const item of report.remoteOverruns) {
    lines.push(`${copy.dashboardRemote} ${item.number} ${item.subject}`);
  }
  return lines;
}
