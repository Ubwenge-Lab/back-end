export function formatIcsDate(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, '0');

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function generateIcsString(params: {
  id: string;
  doctorName: string;
  patientName: string;
  date: Date;
  reason: string;
  roomLink: string;
  hospitalName: string;
}): string {
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(params.date);

  // Default duration is 30 minutes
  const endDate = new Date(params.date.getTime() + 30 * 60 * 1000);
  const dtEnd = formatIcsDate(endDate);

  // Escape description details (newlines, commas, semi-colons)
  const escapedReason = params.reason.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  const escapedHospital = params.hospitalName.replace(/[,;\\]/g, '\\$&');
  const escapedDoctor = params.doctorName.replace(/[,;\\]/g, '\\$&');

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Evuze//Telemedicine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.id}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Medical Consultation with ${escapedDoctor}`,
    `DESCRIPTION:Patient: ${params.patientName}\\nReason: ${escapedReason}\\nHospital: ${escapedHospital}\\nVideo Room: ${params.roomLink}`,
    `LOCATION:${params.roomLink}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return icsLines.join('\r\n');
}
